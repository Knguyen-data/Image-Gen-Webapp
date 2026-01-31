import { GoogleGenerativeAI, Part, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { GenerationRequest, GeneratedImage, ModificationRequest } from "../types";
import { GEMINI_MODEL_ID } from "../constants";

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
    throw new Error(`Model returned text instead of image. Content: "${text.slice(0, 100)}..."`);
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

    const result = await model.generateContent({
      contents: [{ role: "user", parts: parts }]
    });

    return parseResponse(result, req.prompt, req.settings);

  } catch (error: any) {
    console.error("Gemini Generation Error:", error);
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

    const result = await model.generateContent({
      contents: [{ role: "user", parts: parts }]
    });

    return parseResponse(result, req.prompt, req.settings);

  } catch (error: any) {
    console.error("Gemini Modification Error:", error);
    throw new Error(error.message || "Failed to modify image");
  }
};