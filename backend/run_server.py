import sys, os
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

print("DEBUG 1: Script started", flush=True)

try:
    print("DEBUG 2: Importing app...", flush=True)
    from app.main import app
    print("DEBUG 3: App imported successfully!", flush=True)
    
    import uvicorn
    print("DEBUG 4: Configuring uvicorn...", flush=True)
    config = uvicorn.Config(app=app, host="127.0.0.1", port=8000, log_level="debug")
    server = uvicorn.Server(config)
    print("DEBUG 5: Starting server.run()...", flush=True)
    server.run()
except Exception as e:
    import traceback
    print("DEBUG ERROR:", e, flush=True)
    traceback.print_exc()
