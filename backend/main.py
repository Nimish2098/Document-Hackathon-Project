import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import document_processor 
from starlette.responses import StreamingResponse
import asyncio

UPLOAD_DIR = "Uploads"
os.makedirs(UPLOAD_DIR,exist_ok=True)

app = FastAPI(
    title="DocuMind API",
    description="API FOR INTELLIGENT DOCUMENT INDEXER"
)
# for react to access the endpoints
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

class QueryRequest(BaseModel):
    query:str
    
class QueryResponse(BaseModel):
    answer:str
    source_file:str|None=None

@app.get("/")
def read_root():
    return {"message":"Welcome AI Documind, for API documentation /docs"}

@app.post("/upload",summary="Upload the document")
async def upload_document(file: UploadFile=File(...)):
    if not file.filename:
            raise HTTPException(status_code=400,details="No file name provided")
        
    file_path = os.path.join(UPLOAD_DIR,file.filename)
    
    try:
        with open(file_path,"wb") as buffer:
            content = await file.read()
            buffer.write(content)
        sucess = document_processor.process_document(file_path,file.filename)
        
        if sucess:
            return {"filename": file.filename,"message":"File processed and indexed successfully"}
        else:
            raise HTTPException(status_code=500,detail="Failed to process document")
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=600,detail=f"An error occurred:{str(e)}")


@app.post("/query/", summary="Query your document", response_model=QueryResponse)
async def query_documents_endpoint(request: QueryRequest):
    try:
        answer, source = document_processor.query_documents(request.query)
        return QueryResponse(answer=answer, source_file=source)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during Query: {str(e)}")


@app.post("/query-stream",summary="Query your documents(streaming)")
async def query_documents_streaming(request:QueryRequest):
    async def stream_generator():
        try:
            simulated_stream = [
                {request.query}
            ]
            for chunk in simulated_stream:
                yield chunk
                await asyncio.sleep(0.05)
            yield "\n\n[Source:placeholder.pdf]"
        except Exception as e:
            print(f"Error during query stream: {e}")
            yield f"[Error: Could not process query: {str(e)}]"
    return StreamingResponse(stream_generator(),media_type="text/event-stream")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)