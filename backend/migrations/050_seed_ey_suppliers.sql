-- Dummy-Lieferanten fuer Buchungskreis (Standort) EY.
-- Nutzt admin als createdBy/updatedBy. Idempotent: bereits vorhandene Schluessel werden uebersprungen.

DO $$
DECLARE
  v_admin uuid;
  ey_id uuid;
BEGIN
  SELECT u."id" INTO v_admin FROM "users" u WHERE u."loginName" = 'admin' LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION '050_seed_ey_suppliers: kein Benutzer admin';
  END IF;

  SELECT s."id" INTO ey_id FROM "site" s WHERE s."key" = 'EY' LIMIT 1;
  IF ey_id IS NULL THEN
    RAISE NOTICE '050_seed_ey_suppliers: Standort mit Schluessel EY nicht gefunden - uebersprungen';
    RETURN;
  END IF;

  INSERT INTO "supplier" (
    "key", "name", "siteId", "customerNumber", "address", "phone", "email", "isActive",
    "createdBy", "updatedBy"
  )
  VALUES
    ('EY-LIEF-0001', 'Siemens AG', ey_id, 'KD-100245', 'Werner-von-Siemens-Str. 1, 80333 Muenchen', '+49 89 12345600', 'einkauf@siemens.example', true, v_admin, v_admin),
    ('EY-LIEF-0002', 'Bosch Rexroth AG', ey_id, 'KD-100311', 'Zum Eisengiesser 1, 97816 Lohr am Main', '+49 9352 180', 'kontakt@boschrexroth.example', true, v_admin, v_admin),
    ('EY-LIEF-0003', 'SKF GmbH', ey_id, 'KD-100478', 'Gunnar-Wester-Str. 12, 97421 Schweinfurt', '+49 9721 560', 'vertrieb@skf.example', true, v_admin, v_admin),
    ('EY-LIEF-0004', 'Festo SE & Co. KG', ey_id, 'KD-100590', 'Ruiter Str. 82, 73734 Esslingen', '+49 711 3470', 'service@festo.example', true, v_admin, v_admin),
    ('EY-LIEF-0005', 'ifm electronic gmbh', ey_id, 'KD-100633', 'Friedrichstr. 1, 45128 Essen', '+49 201 24220', 'info@ifm.example', true, v_admin, v_admin),
    ('EY-LIEF-0006', 'Pepperl+Fuchs SE', ey_id, 'KD-100701', 'Lilienthalstr. 200, 68307 Mannheim', '+49 621 7760', 'sales@pepperl-fuchs.example', true, v_admin, v_admin),
    ('EY-LIEF-0007', 'Schneider Electric GmbH', ey_id, 'KD-100822', 'Gothaer Str. 29, 40880 Ratingen', '+49 2102 4040', 'de-kontakt@schneider.example', true, v_admin, v_admin),
    ('EY-LIEF-0008', 'Grundfos GmbH', ey_id, 'KD-100905', 'Schluesterstr. 33, 40699 Erkrath', '+49 211 9296960', 'info@grundfos.example', false, v_admin, v_admin)
  ON CONFLICT ("key") DO NOTHING;
END $$;
