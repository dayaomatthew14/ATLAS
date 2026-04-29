import os
import re

routers_dir = r"c:\Users\mtthw\Documents\GitHub\ATLAS\backend\app\routers"

for filename in os.listdir(routers_dir):
    if filename.endswith(".py"):
        filepath = os.path.join(routers_dir, filename)
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Replace exactly @router.get("/") followed by either ) or ,
        new_content = re.sub(r'@router\.(get|post|put|delete)\(\"\/\"(.*?)\)', r'@router.\1(""\2)', content)
        new_content = re.sub(r'@router\.(get|post|put|delete)\(\'\/\'(.*?)\)', r"@router.\1(''\2)", new_content)
        
        if new_content != content:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(new_content)
            print(f"Updated {filename}")
