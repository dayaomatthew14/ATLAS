from app.schemas import ScheduleResponse
from datetime import datetime, time

data = {
    "id": 1,
    "semester_id": 1,
    "curriculum_id": 1,
    "faculty_id": 1,
    "room_id": 1,
    "day_of_week": "Mon",
    "start_time": time(8, 0),
    "end_time": time(9, 30),
    "section": "BSCS-3A",
    "status": "draft",
    "is_locked": False,
    "created_at": datetime.now(),
    "updated_at": datetime.now(),
    "curriculum": {
        "id": 1,
        "code": "CS101",
        "name": "Intro to CS",
        "units": 3,
        "department_id": 1,
        "type": "lecture"
    },
    "room": {
        "id": 1,
        "name": "Room 101",
        "building": "Main",
        "capacity": 40,
        "type": "lecture"
    }
}

res = ScheduleResponse.model_validate(data)
print("Subject:", res.subject)
print("StartTime:", res.startTime)
print("Data:", res.model_dump())
