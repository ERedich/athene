-- Allow per-user default search preset for mobile work-order list (context 'mobile')

ALTER TABLE "userWorkOrderSearchPresetDefault" DROP CONSTRAINT IF EXISTS "userWorkOrderSearchPresetDefault_context_check";

ALTER TABLE "userWorkOrderSearchPresetDefault"
  ADD CONSTRAINT "userWorkOrderSearchPresetDefault_context_check"
  CHECK ("context" IN ('work_orders', 'monitoring', 'mobile'));
