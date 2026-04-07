# DocuMind: AI Document Q&A

This is an AI-powered document assistant built with React and Python (FastAPI). Upload your documents (PDF, DOCX, XLSX, TXT) and ask questions about their content.

This project uses a Retrieval-Augmented Generation (RAG) pipeline to provide answers based only on the documents you upload.

**Tech Stack**

**Backend**: Python, FastAPI, Google Gemini API, pypdf, python-docx, openpyxl

**Frontend**: React (Vite), JavaScript, Tailwind CSS

**How to Run**

You will need two terminals running simultaneously.

1. Run the Backend (Python)

    1. Navigate to the backend folder:
        ```
        cd backend
        ```
    2. Create and activate a virtual environment:

    * Create venv
    ```
    python -m venv venv
    ```
    * Activate (macOS/Linux)
    ```
    source venv/bin/activate
    ```
    * Activate (Windows)
    ```
    venv\Scripts\activate
    ```

    Install the required libraries:
    ```
    pip install -r requirements.txt
    ```

    Create a .env file in the backend folder and add your Google API key:
    ```
    GOOGLE_API_KEY=your_api_key_here

    ```
    Run the server:
    ```
    uvicorn main:app --reload
    ```

    The backend will be running at http://127.0.0.1:8000.

2. Run the Frontend (React)

- Open a new terminal and navigate to the frontend folder:

```
cd frontend
```


 - Install the Node.js dependencies:
```
npm install
```

 - Run the development server:
```
npm run dev
```

* The frontend will open in your browser, usually at http://localhost:5173.