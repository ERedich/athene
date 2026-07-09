-- 15 Mitarbeiter fuer Buchungskreis (Standort) EY (Eystrup).
-- Aktiv + Schichtplanung fuer Drag-and-Drop im Schichtplaner.
-- Idempotent: bereits vorhandene Personalnummern werden uebersprungen.

DO $$
DECLARE
  v_admin uuid;
  ey_id uuid;
BEGIN
  SELECT u."id" INTO v_admin FROM "users" u WHERE u."loginName" = 'admin' LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION '059_seed_ey_employees: kein Benutzer admin';
  END IF;

  SELECT s."id" INTO ey_id FROM "site" s WHERE s."key" = 'EY' LIMIT 1;
  IF ey_id IS NULL THEN
    RAISE NOTICE '059_seed_ey_employees: Standort mit Schluessel EY nicht gefunden - uebersprungen';
    RETURN;
  END IF;

  INSERT INTO "employee" (
    "key", "name", "siteId", "isActive", "isShiftPlanning", "createdBy", "updatedBy"
  )
  VALUES
    ('0004713', 'Anna Becker', ey_id, true, true, v_admin, v_admin),
    ('0004714', 'Thomas Wagner', ey_id, true, true, v_admin, v_admin),
    ('0004715', 'Sabine Hoffmann', ey_id, true, true, v_admin, v_admin),
    ('0004716', 'Michael Schulz', ey_id, true, true, v_admin, v_admin),
    ('0004717', 'Julia Fischer', ey_id, true, true, v_admin, v_admin),
    ('0004718', 'Stefan Meyer', ey_id, true, true, v_admin, v_admin),
    ('0004719', 'Laura Richter', ey_id, true, true, v_admin, v_admin),
    ('0004720', 'Markus Klein', ey_id, true, true, v_admin, v_admin),
    ('0004721', 'Christina Wolf', ey_id, true, true, v_admin, v_admin),
    ('0004722', 'Daniel Schröder', ey_id, true, true, v_admin, v_admin),
    ('0004723', 'Petra Neumann', ey_id, true, true, v_admin, v_admin),
    ('0004724', 'Andreas Schwarz', ey_id, true, true, v_admin, v_admin),
    ('0004725', 'Nicole Zimmermann', ey_id, true, true, v_admin, v_admin),
    ('0004726', 'Frank Braun', ey_id, true, true, v_admin, v_admin),
    ('0004727', 'Katrin Krüger', ey_id, true, true, v_admin, v_admin)
  ON CONFLICT ("key") DO NOTHING;
END $$;
