from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

app = FastAPI()

# Path to the built frontend
dist_path = os.path.join(os.path.dirname(__file__), "frontend", "dist")

# Serve the assets folder
assets_path = os.path.join(dist_path, "assets")
if os.path.exists(assets_path):
    app.mount("/assets", StaticFiles(directory=assets_path), name="assets")

# Serve the index.html for all other routes (SPA support)
@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    file_path = os.path.join(dist_path, full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    index_file = os.path.join(dist_path, "index.html")
    if os.path.isfile(index_file):
        return FileResponse(index_file)
    from fastapi.responses import HTMLResponse
    return HTMLResponse("<h3>Frontend build not found. Please run 'npm run build' in frontend directory.</h3>", status_code=404)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5173)
