# ATLAS — System Flowchart

The main path through the system, in the order it happens.

This describes what ATLAS does today. Timetables are generated adhering to subject teaching hours, term workload limits, mandatory lunch breaks, and room allocations. Room assignment is shown as ending at the Registrar because ATLAS produces a conflict-free professor timetable and the Registrar assigns or confirms general lecture rooms from the submitted file.

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

    Role -- "College Dean /<br/>Program Chair" --> Faculty["Add faculty<br/>set classification (Probationary/Regular/Part-time)<br/>set teaching hours + unavailable times"]
    Faculty --> Offerings["Assign subjects to faculty<br/>calculated by exact teaching hours"]
    Offerings --> OverloadCheck{"Faculty Overload?"}
    OverloadCheck -- Yes --> DeanApproval["Flagged for Dean approval<br/>Dean reviews &amp; approves overload"]
    OverloadCheck -- No --> Ready
    DeanApproval --> Ready

    Ready{"Active term, faculty<br/>and subjects all set?"}
    Ready -- No --> Faculty
    Ready -- Yes --> Generate["Generate the timetable<br/>respecting mandatory 1hr lunch break<br/>(Mon-Fri 12-1pm) &amp; teaching hours"]

    Generate --> Conflicts{"Any conflicts?"}
    Conflicts -- Yes --> Resolve["Resolve one at a time<br/>in the conflict view"]
    Resolve --> Conflicts

    Conflicts -- No --> GridView["View weekly timetable grid<br/>Mon-Sat columns, shared time scale"]
    GridView --> Export[/"Export the schedule<br/>PDF, Excel, or CSV"/]
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

- **Registration** is self-service for Program Chairs only. College Deans are pre-seeded and System Administrators are created server-side.
- **A verification code** is required before an account can log in.
- **Nothing can be generated** until an administrator has set an active academic term — this is why the administrator branch feeds the chair's work.
- **Teaching load is measured in actual weekly hours** rather than academic units. Overloads are permitted but flagged for Dean approval.
- **Mandatory Lunch Break** is reserved strictly from 12:00 PM to 01:00 PM, Monday through Friday (Saturdays exempt).
- **Conflicts are resolved one at a time**, deliberately; there is no bulk auto-solve.
- **Rooms are best-effort.** A laboratory is given a free laboratory room where one exists, and left blank (`TBA`) where none is.
