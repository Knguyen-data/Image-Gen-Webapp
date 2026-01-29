# Raw Image Prompt Studio

A powerful web interface for generating images using Google's Gemini models. This application allows for batched generation, reference image support, and detailed prompt management.

![App Screenshot](https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6) 
*(Note: Replace with actual screenshot if available)*

## Features

*   **Batch Generation**: Generate multiple images at once from varied prompts.
*   **Reference Images**: Attach reference images to guide the generation style or content.
*   **Prompt Management**: Manage lists of prompts easily.
*   **Local History**: Generated images are stored locally in your browser (IndexedDB/Local Storage), so you don't lose them on refresh.
*   **Secure API Key Usage**: Your Google Gemini API key is stored locally in your browser and never sent anywhere except to Google's servers.

## Getting Started

### Prerequisites

*   Node.js installed on your machine.
*   A Google Cloud Project with the Gemini API enabled (or simply an API Key from Google AI Studio).

### Installation

1.  Clone this repository or download the files.
2.  Open a terminal in the project directory.
3.  Install dependencies:
    ```bash
    npm install
    ```

### Running the App

1.  Start the development server:
    ```bash
    npm run dev
    ```
2.  Open your browser and navigate to the URL shown in the terminal (usually `http://localhost:5173`).

### Usage

1.  **Enter API Key**: When you first load the app, you will be prompted to enter your Google Gemini API Key. This is saved to your browser's local storage.
2.  **Add Prompts**: Use the left panel to input your text prompts.
3.  **Add Reference Images** (Optional): Upload images to influence the generation.
4.  **Generate**: Click the generate button and watch your images appear in the right panel!

## built With

*   [Vite](https://vitejs.dev/)
*   [React](https://reactjs.org/)
*   [Google Gemini API](https://ai.google.dev/)
*   TailwindCSS (via inline styles or configured classes)

## License

MIT
