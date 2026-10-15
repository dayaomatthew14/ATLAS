# ATLAS — System Flowchart

The main path through the system, in the order it happens.

This describes what ATLAS does today. Room assignment is shown as ending at the
Registrar because that is where it ends: ATLAS produces a conflict-free
professor timetable and the Registrar assigns the rooms from the submitted file.

```mermaid
flowchart TD
    Start([Start]) --> Register[/"Register<br/>name, email, password,<br/>role, college"/]
    Register --> SendCode["System emails a<br/>verification code"]
    SendCode --> CodeOK{"Code correct?"}
    CodeOK -- No --> SendCode
    CodeOK -- Yes --> Login[/"Log in<br/>email + password"/]

    Login --> Role{"Role?"}

    Role -- Administrator --> AdminSetup["Set the active term<br/>Maintain colleges &amp; programmes<br/>Import curriculum<br/>Register rooms<br/>Verify accounts"]
    AdminSetup --> AdminDone([End])

    Role -- "Program Chair /<br/>Coordinator" --> Faculty["Add faculty<br/>set teaching hours + unavailable times"]
    Faculty --> Offerings["Assign subjects to faculty"]
    Offerings --> Ready{"Active term, faculty<br/>and subjects all set?"}

    Ready -- No --> Faculty
    Ready -- Yes --> Generate["Generate the timetable"]

    Generate --> Conflicts{"Any conflicts?"}
    Conflicts -- Yes --> Resolve["Resolve one at a time<br/>in the conflict view"]
    Resolve --> Conflicts

    Conflicts -- No --> Export[/"Export the schedule<br/>CSV, Word or PDF"/]
    Export --> Submit["Submit to the Registrar"]
    Submit --> Rooms["Registrar assigns the rooms"]
    Rooms --> Done([End])
```

## Shapes

| Shape | Meaning |
|---|---|
| Stadium — `( )` | Start / End |
| Parallelogram — `/ /` | Input or output |
| Rectangle | Process the system performs |
| Diamond | Decision |

## Notes

- **Registration** is self-service for Program Chair and Coordinator only.
  Administrator accounts are created server-side.
- **A verification code** is required before an account can log in.
- **Nothing can be generated** until an administrator has set an active academic
  term — this is why the administrator branch feeds the chair's work.
- **Conflicts are resolved one at a time**, deliberately; there is no bulk
  auto-solve.
- **Rooms are best-effort.** A laboratory is given a free laboratory room where
  one exists, and left blank where none is. A blank room is not an error — it is
  the Registrar's column to fill. Lecture subjects are never given a room.
