-- 100 Assets für Buchungskreis (Standort) EY: 3× Typ „site“, 97 Kinder (Struktur/Linie/IH-Objekt).
-- Nutzt ausschließlich bestehende Kostenstellen von EY (aktive bevorzugt, sonst alle des Standorts).
-- Idempotent: bricht ab, wenn Schlüssel EY-ANL-ROOT bereits existiert.

DO $$
DECLARE
  v_admin uuid;
  ey_id uuid;
  cc_ids uuid[];
  n_cc int;
  root_id uuid;
  nord_id uuid;
  sued_id uuid;
  str_ids uuid[];
  ln_ids uuid[];
  new_id uuid;
  mfr text[] := ARRAY[
    'Siemens AG',
    'ABB Automation',
    'Bosch Rexroth AG',
    'SKF GmbH',
    'Grundfos A/S',
    'Festo SE & Co. KG',
    'KUKA Deutschland GmbH',
    'Schneider Electric',
    'ifm electronic gmbh',
    'Pepperl+Fuchs SE'
  ];
  i int;
  j int;
  k int;
  idx int := 0;
  mf text;
  cc uuid;
  bdate date;
  sn text;
  rm text;
BEGIN
  SELECT u."id" INTO v_admin FROM "users" u WHERE u."loginName" = 'admin' LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION '014_seed_ey_booking_circle_assets: kein Benutzer admin';
  END IF;

  SELECT s."id" INTO ey_id FROM "site" s WHERE s."key" = 'EY' LIMIT 1;
  IF ey_id IS NULL THEN
    RAISE NOTICE '014_seed_ey_booking_circle_assets: Standort mit Schlüssel EY nicht gefunden – übersprungen';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM "asset" a WHERE a."key" = 'EY-ANL-ROOT') THEN
    RAISE NOTICE '014_seed_ey_booking_circle_assets: EY-Anlagenblock bereits vorhanden – übersprungen';
    RETURN;
  END IF;

  SELECT array_agg(c."id" ORDER BY c."key")
  INTO cc_ids
  FROM "costCenter" c
  WHERE c."siteId" = ey_id AND c."isActive" = true;

  IF cc_ids IS NULL THEN
    SELECT array_agg(c."id" ORDER BY c."key")
    INTO cc_ids
    FROM "costCenter" c
    WHERE c."siteId" = ey_id;
  END IF;

  IF cc_ids IS NULL THEN
    RAISE EXCEPTION '014_seed_ey_booking_circle_assets: Keine Kostenstelle für Standort EY – zuerst Kostenstellen pflegen';
  END IF;

  n_cc := cardinality(cc_ids);

  -- Drei Assets Typ „site“
  idx := idx + 1;
  cc := cc_ids[1 + ((idx - 1) % n_cc)];
  INSERT INTO "asset" (
    "key", "name", "siteId", "type", "parentAssetId", "costCenterId",
    "serialNumber", "buildDate", "manufacturer", "remark", "createdBy", "updatedBy"
  )
  VALUES (
    'EY-ANL-ROOT',
    'Anlagenverbund Buchungskreis EY',
    ey_id,
    'site',
    NULL,
    cc,
    'EY-NET-2014-88421',
    DATE '2014-03-15',
    mfr[1],
    'Strukturkopf EY; untergeordnete Fertigungsstandorte Nord und Süd.',
    v_admin,
    v_admin
  )
  RETURNING "id" INTO root_id;

  idx := idx + 1;
  cc := cc_ids[1 + ((idx - 1) % n_cc)];
  INSERT INTO "asset" (
    "key", "name", "siteId", "type", "parentAssetId", "costCenterId",
    "serialNumber", "buildDate", "manufacturer", "remark", "createdBy", "updatedBy"
  )
  VALUES (
    'EY-ANL-NORD',
    'Fertigungsstandort Nord – EY',
    ey_id,
    'site',
    root_id,
    cc,
    'EY-NORD-2016-102883',
    DATE '2016-08-22',
    mfr[2],
    'Hauptstandort Nord: Montage, Endprüfung, Versand.',
    v_admin,
    v_admin
  )
  RETURNING "id" INTO nord_id;

  idx := idx + 1;
  cc := cc_ids[1 + ((idx - 1) % n_cc)];
  INSERT INTO "asset" (
    "key", "name", "siteId", "type", "parentAssetId", "costCenterId",
    "serialNumber", "buildDate", "manufacturer", "remark", "createdBy", "updatedBy"
  )
  VALUES (
    'EY-ANL-SUED',
    'Fertigungsstandort Süd – EY',
    ey_id,
    'site',
    root_id,
    cc,
    'EY-SUED-2017-440912',
    DATE '2017-11-03',
    mfr[3],
    'Standort Süd: Zulieferfertigung und Vorproduktion.',
    v_admin,
    v_admin
  )
  RETURNING "id" INTO sued_id;

  -- Nord: 10 Gebäude/Strukturen, je 2 Linien, 18 IH-Objekte (48)
  str_ids := ARRAY[]::uuid[];
  FOR i IN 1..10 LOOP
    idx := idx + 1;
    cc := cc_ids[1 + ((idx - 1) % n_cc)];
    mf := mfr[1 + ((idx - 1) % 10)];
    bdate := (DATE '2009-05-01' + ((idx * 83) % 5200))::date;
    sn := format('EY-N-G%02s-%s', i, to_char(bdate, 'YYYY'));
    rm := CASE (i % 4) WHEN 0 THEN NULL WHEN 1 THEN 'Brandschutzzone F30.' WHEN 2 THEN 'Schaltschrankraum RLT nach VDI.' ELSE 'Zugang Logistikfläche Nord.' END;
    INSERT INTO "asset" (
      "key", "name", "siteId", "type", "parentAssetId", "costCenterId",
      "serialNumber", "buildDate", "manufacturer", "remark", "createdBy", "updatedBy"
    )
    VALUES (
      format('EY-N-G%02s', i),
      format('Produktionsgebäude Nord %s', i),
      ey_id,
      'structure',
      nord_id,
      cc,
      sn,
      bdate,
      mf,
      rm,
      v_admin,
      v_admin
    )
    RETURNING "id" INTO new_id;
    str_ids := str_ids || new_id;
  END LOOP;

  ln_ids := ARRAY[]::uuid[];
  FOR i IN 1..10 LOOP
    FOR j IN 1..2 LOOP
      idx := idx + 1;
      cc := cc_ids[1 + ((idx - 1) % n_cc)];
      mf := mfr[1 + ((idx - 1) % 10)];
      bdate := (DATE '2011-02-10' + ((idx * 61) % 4800))::date;
      sn := format('EY-N-G%02s-L%s-%s', i, j, to_char(bdate, 'YYYYMM'));
      rm := CASE j WHEN 1 THEN 'Hauptfluss Montage.' ELSE 'Nebenfluss Rework / Nacharbeit.' END;
      INSERT INTO "asset" (
        "key", "name", "siteId", "type", "parentAssetId", "costCenterId",
        "serialNumber", "buildDate", "manufacturer", "remark", "createdBy", "updatedBy"
      )
      VALUES (
        format('EY-N-G%02s-L%s', i, j),
        format('Montagelinie Nord G%s / Band %s', i, j),
        ey_id,
        'line',
        str_ids[i],
        cc,
        sn,
        bdate,
        mf,
        rm,
        v_admin,
        v_admin
      )
      RETURNING "id" INTO new_id;
      ln_ids := ln_ids || new_id;
    END LOOP;
  END LOOP;

  FOR k IN 1..18 LOOP
    idx := idx + 1;
    cc := cc_ids[1 + ((idx - 1) % n_cc)];
    mf := mfr[1 + ((idx - 1) % 10)];
    bdate := (DATE '2013-07-20' + ((idx * 71) % 4100))::date;
    sn := format('EY-N-IH-%s-%s', lpad(k::text, 3, '0'), to_char(bdate, 'YYYY'));
    rm := CASE (k % 5) WHEN 0 THEN 'Jähriger Wartungsvertrag.' WHEN 1 THEN 'Kritischer Pfad OEE.' ELSE NULL END;
    INSERT INTO "asset" (
      "key", "name", "siteId", "type", "parentAssetId", "costCenterId",
      "serialNumber", "buildDate", "manufacturer", "remark", "createdBy", "updatedBy"
    )
    VALUES (
      format('EY-N-LN%03s-K01', k),
      CASE (k % 6)
        WHEN 0 THEN format('Hydraulikaggregat Linie %s', k)
        WHEN 1 THEN format('Roboterschweißzelle Linie %s', k)
        WHEN 2 THEN format('Prüfstand elektrisch Linie %s', k)
        WHEN 3 THEN format('Fördertechnikmotor Linie %s', k)
        WHEN 4 THEN format('Kühlkreislauf Verdichter Linie %s', k)
        ELSE format('Sicherheitssteuerung SR Linie %s', k)
      END,
      ey_id,
      'maintenanceObject',
      ln_ids[k],
      cc,
      sn,
      bdate,
      mf,
      rm,
      v_admin,
      v_admin
    );
  END LOOP;

  -- Süd: 10 Strukturen, 20 Linien, 19 IH-Objekte (49)
  str_ids := ARRAY[]::uuid[];
  FOR i IN 1..10 LOOP
    idx := idx + 1;
    cc := cc_ids[1 + ((idx - 1) % n_cc)];
    mf := mfr[1 + ((idx - 1) % 10)];
    bdate := (DATE '2010-09-12' + ((idx * 89) % 5300))::date;
    sn := format('EY-S-G%02s-%s', i, to_char(bdate, 'YYYY'));
    rm := CASE (i % 3) WHEN 0 THEN 'Erdgeschoss Produktion.' WHEN 1 THEN 'Mezzanin Technik.' ELSE NULL END;
    INSERT INTO "asset" (
      "key", "name", "siteId", "type", "parentAssetId", "costCenterId",
      "serialNumber", "buildDate", "manufacturer", "remark", "createdBy", "updatedBy"
    )
    VALUES (
      format('EY-S-G%02s', i),
      format('Produktionsgebäude Süd %s', i),
      ey_id,
      'structure',
      sued_id,
      cc,
      sn,
      bdate,
      mf,
      rm,
      v_admin,
      v_admin
    )
    RETURNING "id" INTO new_id;
    str_ids := str_ids || new_id;
  END LOOP;

  ln_ids := ARRAY[]::uuid[];
  FOR i IN 1..10 LOOP
    FOR j IN 1..2 LOOP
      idx := idx + 1;
      cc := cc_ids[1 + ((idx - 1) % n_cc)];
      mf := mfr[1 + ((idx - 1) % 10)];
      bdate := (DATE '2012-04-18' + ((idx * 67) % 4900))::date;
      sn := format('EY-S-G%02s-L%s-%s', i, j, to_char(bdate, 'YYYYMM'));
      rm := CASE j WHEN 1 THEN 'Automatisierter Haupttakt.' ELSE 'Handarbeitsinsel / Varianten.' END;
      INSERT INTO "asset" (
        "key", "name", "siteId", "type", "parentAssetId", "costCenterId",
        "serialNumber", "buildDate", "manufacturer", "remark", "createdBy", "updatedBy"
      )
      VALUES (
        format('EY-S-G%02s-L%s', i, j),
        format('Fertigungslinie Süd G%s / Segment %s', i, j),
        ey_id,
        'line',
        str_ids[i],
        cc,
        sn,
        bdate,
        mf,
        rm,
        v_admin,
        v_admin
      )
      RETURNING "id" INTO new_id;
      ln_ids := ln_ids || new_id;
    END LOOP;
  END LOOP;

  FOR k IN 1..19 LOOP
    idx := idx + 1;
    cc := cc_ids[1 + ((idx - 1) % n_cc)];
    mf := mfr[1 + ((idx - 1) % 10)];
    bdate := (DATE '2015-01-05' + ((idx * 73) % 3900))::date;
    sn := format('EY-S-IH-%s-%s', lpad(k::text, 3, '0'), to_char(bdate, 'YYYY'));
    rm := CASE (k % 4) WHEN 0 THEN 'Reserveteil im Lager Süd.' ELSE NULL END;
    INSERT INTO "asset" (
      "key", "name", "siteId", "type", "parentAssetId", "costCenterId",
      "serialNumber", "buildDate", "manufacturer", "remark", "createdBy", "updatedBy"
    )
    VALUES (
      format('EY-S-LN%03s-K01', k),
      CASE (k % 7)
        WHEN 0 THEN format('Verdichtereinheit Linie %s', k)
        WHEN 1 THEN format('CNC-Bearbeitungsmodul Linie %s', k)
        WHEN 2 THEN format('Messtechnik Laser Linie %s', k)
        WHEN 3 THEN format('Pneumatikventilinsel Linie %s', k)
        WHEN 4 THEN format('Induktive Härteanlage Linie %s', k)
        WHEN 5 THEN format('Etikettierer Linie %s', k)
        ELSE format('Sicherheitstür Interlock Linie %s', k)
      END,
      ey_id,
      'maintenanceObject',
      ln_ids[k],
      cc,
      sn,
      bdate,
      mf,
      rm,
      v_admin,
      v_admin
    );
  END LOOP;

  IF idx <> 100 THEN
    RAISE EXCEPTION '014_seed_ey_booking_circle_assets: interne Zählerinkonsistenz (idx=% statt 100)', idx;
  END IF;
END $$;
