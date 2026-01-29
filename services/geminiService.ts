import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GenerationRequest, GeneratedImage } from "../types";
import { GEMINI_MODEL_ID } from "../constants";

const getClient = (apiKey: string) => {
  // STRICT MODE: Only use the provided apiKey. Do not fallback to process.env.API_KEY.
  if (!apiKey) throw new Error("API Key is missing. Please set it in the settings.");
  
  // Removed manual format check (AIza prefix) per user request.
  
  return new GoogleGenAI({ apiKey });
};

const parseResponse = (response: GenerateContentResponse, prompt: string, settings: any): GeneratedImage => {
    // Extract image from response
    let base64Data: string | null = null;
    let mimeType: string = 'image/png';

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          base64Data = part.inlineData.data;
          mimeType = part.inlineData.mimeType || 'image/png';
          break; // Found the image
        }
      }
    }

    if (!base64Data) {
      // Check if there's a text response explaining why image failed
      const textPart = response.text;
      if (textPart) {
          throw new Error(`Model returned text instead of image: "${textPart.slice(0, 100)}..."`);
      }
      throw new Error("No image data found in response.");
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
  const ai = getClient(req.apiKey);
  
  try {
    // Construct Parts: Text Prompt + Reference Images
    const parts: any[] = [
        { text: req.prompt }
    ];

    // Add Reference Images
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

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_ID,
      contents: {
        parts: parts,
      },
      config: {
        temperature: req.settings.temperature,
        imageConfig: {
          aspectRatio: req.settings.aspectRatio,
          imageSize: req.settings.imageSize,
        },
      },
    });

    return parseResponse(response, req.prompt, req.settings);

  } catch (error: any) {
    console.error("Gemini Generation Error:", error);
    throw new Error(error.message || "Failed to generate image");
  }
};