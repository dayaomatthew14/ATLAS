import requests

session = requests.Session()
response = session.post("http://localhost:8000/api/auth/login", data={"username": "chair@dlsau.edu.ph", "password": "password123"})
if response.status_code == 200:
    print("Login successful.")
    del_res = session.delete("http://localhost:8000/api/logs")
    print("DELETE /api/logs status:", del_res.status_code)
    print("DELETE /api/logs response:", del_res.text)
else:
    print("Login failed:", response.status_code, response.text)
