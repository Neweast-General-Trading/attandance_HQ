# Attendance and hours rules

Direction is taken from the device name, then from the Direction field on the punch. The door role decides whether the movement is a building entry, a building exit, or movement inside HQ.

## Door types

| Type | Meaning |
| --- | --- |
| Building entry | Entering HQ. The person is inside the building. |
| Building exit | Leaving HQ. The person is outside the building. |
| Inside entry / Inside exit | An internal door, such as Food Court. The person stays inside HQ. |
| Room / other | A room or device that does not change whether the person is in the building. |

Stored values: `building_in`, `building_out`, `internal_in`, `internal_out`, `other`.

## Food Court

These two serials stay internal doors even if a save tries to change them:

| Device | Serial | Type |
| --- | --- | --- |
| MB GF FC IN | GM9731498 | Inside entry |
| MB GF FC OUT | GM9731530 | Inside exit |

Example: if a person's only punch today is `MB GF FC OUT`, the status is **In the building**, with a note that they were seen on an inside door. It is not Exit only and it is not Already left.

Already left means the latest building movement is a building exit.

Exit only means a building exit with no building entry on the same day.

## Hours

For each person and each day:

1. **In the building** — pairs of building entry then building exit.
2. **Non-productive** — pairs of inside doors (inside entry then inside exit), clipped to the time the person was in the building. Food Court is included here.
3. **Productive** — time in the building minus non-productive time.

An open day that has no building exit is clipped to the read time, and never past the end of that day.

Overview shows the totals as a pie. Choosing Productive or Non-productive lists the people in the current filter.

## Late arrival

Presence marks a first punch after **09:15** as late. That flag is separate from productive hours.
