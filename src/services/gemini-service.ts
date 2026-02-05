import { GoogleGenerativeAI, Part, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { GenerationRequest, GeneratedImage, ModificationRequest } from "../types";
import { GEMINI_MODEL_ID } from "../constants";

// Simple request ID for log correlation
const generateRequestId = () => `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// Log API response metadata for debugging (based on official Gemini API structure)
const logResponseMetadata = (requestId: string, response: any, action: string) => {
  const candidates = response?.candidates || [];
  console.log(`[API Response] ${requestId}`, {
    action,
    candidatesCount: candidates.length,
    candidates: candidates.map((c: any) => ({
      finishReason: c.finishReason,                    // STOP, SAFETY, MAX_TOKENS, RECITATION, OTHER
      finishMessage: c.finishMessage,                  // Optional explanation
      safetyRatings: c.safetyRatings,                  // [{category, probability}]
      contentParts: c.content?.parts?.length || 0,
      hasText: !!c.content?.parts?.[0]?.text,
      hasImage: !!c.content?.parts?.[0]?.inlineData
    })),
    promptFeedback: {                                  // Prompt-level blocking
      blockReason: response?.promptFeedback?.blockReason,  // SAFETY, IMAGE_SAFETY, etc.
      safetyRatings: response?.promptFeedback?.safetyRatings
    },
    usageMetadata: response?.usageMetadata,            // Token counts
    timestamp: new Date().toISOString()
  });
};

// Helper to convert base64 to GenerativePart if supported, or just inline data
// For GoogleGenerativeAI, we usually pass array of parts.
// Valid parts: string (text) or { inlineData: { mimeType, data } }

const parseResponse = (result: any, prompt: string, settings: any): GeneratedImage => {
  // result is GenerateContentResult
  const response = result.response;
  if (!response) throw new Error("No response received");

  // Handling Image Generation response from Gemini 2.0 or Imagen on AI Studio
  // Usually images come as inlineData in candidates.
  // NOTE: The SDK text() method gets text, but we need raw parts for images.

  // Using internal structure access since specific helper might not exist for images yet
  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) throw new Error("No candidates returned");

  const firstPart = candidates[0].content?.parts?.[0];

  let base64Data: string | null = null;
  let mimeType: string = 'image/png';

  // Check for inline data (Image)
  if (firstPart && firstPart.inlineData) {
    base64Data = firstPart.inlineData.data;
    mimeType = firstPart.inlineData.mimeType || 'image/png';
  }
  // Check for "executable code" or other formats if model generated code to make image?
  // No, assuming direct image response.

  if (!base64Data) {
    // If mostly text, throw error unless we can find image in other parts
    for (const part of candidates[0].content?.parts || []) {
      if (part.inlineData) {
        base64Data = part.inlineData.data;
        mimeType = part.inlineData.mimeType;
        break;
      }
    }
  }

  if (!base64Data) {
    const text = response.text ? response.text() : "No content";
    const candidates = response.candidates || [];
    const promptFeedback = response.promptFeedback || {};

    // Log FULL details for debugging (official API structure)
    console.error('[API Error] No image in response', {
      fullText: text,
      candidatesCount: candidates.length,
      candidates: candidates.map((c: any) => ({
        finishReason: c.finishReason,                    // STOP, SAFETY, MAX_TOKENS, RECITATION
        finishMessage: c.finishMessage,                  // Optional explanation
        safetyRatings: c.safetyRatings,                  // [{category, probability}]
        contentPartsTypes: c.content?.parts?.map((p: any) =>
          p.inlineData ? `image/${p.inlineData.mimeType}` :
          p.text ? 'text' : 'unknown'
        )
      })),
      promptFeedback: {
        blockReason: promptFeedback.blockReason,         // SAFETY, IMAGE_SAFETY, PROHIBITED_CONTENT
        safetyRatings: promptFeedback.safetyRatings      // Prompt-level safety ratings
      },
      usageMetadata: response.usageMetadata,             // Token counts
      timestamp: new Date().toISOString()
    });

    // Include key info in error message (user-facing)
    const finishReason = candidates[0]?.finishReason || 'UNKNOWN';
    const blockReason = promptFeedback.blockReason;

    // Check for MEDIUM/HIGH probability in safety ratings (official API structure)
    const hasSafetyBlock =
      blockReason === 'SAFETY' ||
      blockReason === 'IMAGE_SAFETY' ||
      candidates.some((c: any) =>
        c.finishReason === 'SAFETY' ||
        c.safetyRatings?.some((r: any) =>
          r.probability === 'MEDIUM' || r.probability === 'HIGH'
        )
      );

    throw new Error(
      `Model returned text instead of image. ` +
      `Finish: ${finishReason}. ` +
      `Block: ${blockReason || 'none'}. ` +
      `Safety blocked: ${hasSafetyBlock}. ` +
      `Content preview: "${text.slice(0, 200)}"`
    );
  }

  return {
    id: crypto.randomUUID(),
    base64: base64Data,
    mimeType,
    createdAt: Date.now(),
    promptUsed: prompt,
    settingsSnapshot: settings,
    seed: Math.floor(Math.random() * 1000000),
  };
};

export const generateImage = async (
  req: GenerationRequest
): Promise<GeneratedImage> => {
  if (!req.apiKey) throw new Error("API Key is missing.");

  const genAI = new GoogleGenerativeAI(req.apiKey);

  // Build safety settings - when filter DISABLED, use BLOCK_NONE
  const safetySettings = !req.settings.safetyFilterEnabled
    ? [
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE }
      ]
    : undefined;  // When enabled, use API defaults

  // Use the specific model ID from constants (gemini-3-pro-image-preview)
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL_ID,
    safetySettings: safetySettings
  });

  // Generate request ID before try block for proper correlation
  const requestId = generateRequestId();

  try {
    const parts: Part[] = [
      { text: req.prompt }
    ];

    if (req.referenceImages && req.referenceImages.length > 0) {
      req.referenceImages.forEach(img => {
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.base64
          }
        });
      });
    }

    console.log(`[API Request] ${requestId}`, {
      action: 'generateImage',
      promptPreview: req.prompt.slice(0, 100),
      promptLength: req.prompt.length,
      referenceImageCount: req.referenceImages?.length || 0,
      aspectRatio: req.settings.aspectRatio,
      imageSize: req.settings.imageSize,
      safetyFilterEnabled: req.settings.safetyFilterEnabled,
      timestamp: new Date().toISOString()
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: parts }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: req.settings.aspectRatio,
          imageSize: req.settings.imageSize
        }
      } as any  // SDK types not updated yet, but API supports these params
    });

    logResponseMetadata(requestId, result.response, 'generateImage');

    return parseResponse(result, req.prompt, req.settings);

  } catch (error: any) {
    console.error('[API Error] generateImage failed', {
      requestId,
      error: {
        message: error.message,
        name: error.name,
        status: error.status,
        statusCode: error.statusCode,
        details: error.details,
        stack: error.stack?.split('\n').slice(0, 5).join('\n')
      },
      timestamp: new Date().toISOString()
    });
    throw new Error(error.message || "Failed to generate image");
  }
};

export const modifyImage = async (
  req: ModificationRequest
): Promise<GeneratedImage> => {
  if (!req.apiKey) throw new Error("API Key is missing.");

  const genAI = new GoogleGenerativeAI(req.apiKey);

  // Build safety settings - when filter DISABLED, use BLOCK_NONE
  const safetySettings = !req.settings.safetyFilterEnabled
    ? [
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE }
      ]
    : undefined;  // When enabled, use API defaults

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL_ID,
    safetySettings: safetySettings
  });

  // Generate request ID before try block for proper correlation
  const requestId = generateRequestId();

  try {
    const parts: Part[] = [
      { text: req.prompt },
      {
        inlineData: {
          mimeType: req.sourceImage.mimeType,
          data: req.sourceImage.base64
        }
      }
    ];

    // Add additional reference images if provided
    if (req.referenceImages && req.referenceImages.length > 0) {
      req.referenceImages.forEach(img => {
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.base64
          }
        });
      });
    }

    console.log(`[API Request] ${requestId}`, {
      action: 'modifyImage',
      promptPreview: req.prompt.slice(0, 100),
      promptLength: req.prompt.length,
      hasSourceImage: true,
      referenceImageCount: req.referenceImages?.length || 0,
      aspectRatio: req.settings.aspectRatio,
      imageSize: req.settings.imageSize,
      safetyFilterEnabled: req.settings.safetyFilterEnabled,
      timestamp: new Date().toISOString()
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: parts }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: req.settings.aspectRatio,
          imageSize: req.settings.imageSize
        }
      } as any  // SDK types not updated yet, but API supports these params
    });

    logResponseMetadata(requestId, result.response, 'modifyImage');

    return parseResponse(result, req.prompt, req.settings);

  } catch (error: any) {
    console.error('[API Error] modifyImage failed', {
      requestId,
      error: {
        message: error.message,
        name: error.name,
        status: error.status,
        statusCode: error.statusCode,
        details: error.details,
        stack: error.stack?.split('\n').slice(0, 5).join('\n')
      },
      timestamp: new Date().toISOString()
    });
    throw new Error(error.message || "Failed to modify image");
  }
};
