# Change food plan or diet from the next bill (product gap 1a)

Approved by the owner on 2026-11-13 ("yes for all decisions"). Before this, a resident could only change food by
cancelling the plan and subscribing again.

## Rule

- An active plan that is not ending can change its **food plan** (Full board, Breakfast + dinner, No food) and/or **diet**
  (veg, non-veg). There is no fee.
- The change starts with the **first billing period whose bill is not paid yet**, counted from tomorrow. The current
  period is never changed: nobody is charged again or refunded for days already eaten. If next month was paid early,
  the change waits for the month after.
- Bills already made for that period or later, but unpaid, are made again at the new price, as a move does.
- One change waits at a time; saving again replaces it. It can be cancelled until its first day ("Keep my current plan").
- Asking for the plan already in force is refused in plain words. Without food, the diet changes nothing.
- Food can only be chosen where it is served on the first day of the change, which counts a scheduled move. Likewise a
  move into a hostel without food is refused while a change to a food plan waits.
- Cancelling the plan drops a change that would start after the plan ends.
- The daily job writes the change onto the plan on its first day. A plan no longer active by then drops it.

## What follows on each date

Until the change is written onto the plan, everything that depends on the plan uses the plan **in force on that date**:
the menu ("in plan"), skips (a meal the new plan leaves out cannot be skipped from its first day) and the owner's
kitchen headcount (meals and veg/non-veg split). Skips already booked, from the first day on, for meals the new plan
leaves out are removed when the change is saved; otherwise they would earn credit on a bill that no longer charges for
those meals.

## Where

| Part | Where |
|---|---|
| Data | `food_plan_changes` (migration `0014_food_plan_changes`), one `scheduled` row per subscription at most |
| API | `POST /me/food-plan`, `DELETE /me/food-plan/:id`; `GET /me/subscription` carries `scheduledFoodChange` |
| Logic | `services/food-plan.ts` (writes, job), `services/food-plan-state.ts` (`planOn`, shared by billing, menu, headcount) |
| Web | `/account/food`; notice and "Keep my current plan" on `/account` |
| App | `app/food-plan.tsx`; notice on My Stay; `lib/foodPlan.ts` |
| Tests | `apps/api/test/food-plan-change.test.ts`, `apps/mobile/test/stay.test.ts` › food plan change, `apps/web/e2e/resident-daily.spec.ts` › 2b |
