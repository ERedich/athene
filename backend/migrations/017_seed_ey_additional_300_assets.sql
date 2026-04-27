-- Addiert 300 weitere Assets fuer Buchungskreis/Standort EY.
-- Aufbau: 12 Strukturen, 36 Linien, 252 IH-Objekte = 300.
-- Idempotent: bricht ab, wenn Schluessel EY-EXT-N-G01 bereits existiert.

DO $$
DECLARE
  v_admin uuid;
  ey_id uuid;
  root_id uuid;
  nord_id uuid;
  sued_id uuid;
  cc_ids uuid[];
  n_cc int;
  str_ids uuid[];
  ln_ids uuid[];
  idx int := 0;
  i int;
  j int;
  k int;
  parent_site uuid;
  new_id uuid;
  mf text;
  cc uuid;
  bdate date;
  sn text;
  rm text;
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
BEGIN
  SELECT u."id" INTO v_admin FROM "users" u WHERE u."loginName" = 'admin' LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION '017_seed_ey_additional_300_assets: kein Benutzer admin';
  END IF;

  SELECT s."id" INTO ey_id FROM "site" s WHERE s."key" = 'EY' LIMIT 1;
  IF ey_id IS NULL THEN
    RAISE NOTICE '017_seed_ey_additional_300_assets: Standort EY nicht gefunden - uebersprungen';
    RETURN;
  END IF;

  SELECT a."id" INTO root_id FROM "asset" a WHERE a."key" = 'EY-ANL-ROOT' LIMIT 1;
  SELECT a."id" INTO nord_id FROM "asset" a WHERE a."key" = 'EY-ANL-NORD' LIMIT 1;
  SELECT a."id" INTO sued_id FROM "asset" a WHERE a."key" = 'EY-ANL-SUED' LIMIT 1;

  IF root_id IS NULL OR nord_id IS NULL OR sued_id IS NULL THEN
    RAISE EXCEPTION '017_seed_ey_additional_300_assets: Basisstruktur EY-ANL-ROOT/-NORD/-SUED fehlt';
  END IF;

  IF EXISTS (SELECT 1 FROM "asset" a WHERE a."key" = 'EY-EXT-N-G01') THEN
    RAISE NOTICE '017_seed_ey_additional_300_assets: Erweiterungsblock bereits vorhanden - uebersprungen';
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
    RAISE EXCEPTION '017_seed_ey_additional_300_assets: Keine Kostenstelle fuer Standort EY gefunden';
  END IF;

  n_cc := cardinality(cc_ids);
  str_ids := ARRAY[]::uuid[];

  -- 12 neue Strukturen: 6 Nord, 6 Sued
  FOR i IN 1..12 LOOP
    idx := idx + 1;
    cc := cc_ids[1 + ((idx - 1) % n_cc)];
    mf := mfr[1 + ((idx - 1) % 10)];
    bdate := (DATE '2014-01-10' + ((idx * 79) % 3600))::date;
    sn := format('EY-EXT-%s-G%02s-%s', CASE WHEN i <= 6 THEN 'N' ELSE 'S' END, CASE WHEN i <= 6 THEN i ELSE i - 6 END, to_char(bdate, 'YYYY'));
    rm := CASE
      WHEN i <= 6 THEN 'Erweiterung Nord fuer neue Produktfamilie.'
      ELSE 'Erweiterung Sued fuer Variantenfertigung.'
    END;
    parent_site := CASE WHEN i <= 6 THEN nord_id ELSE sued_id END;

    INSERT INTO "asset" (
      "key", "name", "siteId", "type", "parentAssetId", "costCenterId",
      "serialNumber", "buildDate", "manufacturer", "remark", "createdBy", "updatedBy"
    )
    VALUES (
      format('EY-EXT-%s-G%02s', CASE WHEN i <= 6 THEN 'N' ELSE 'S' END, CASE WHEN i <= 6 THEN i ELSE i - 6 END),
      format(
        'Erweiterungsgebaeude %s %s',
        CASE WHEN i <= 6 THEN 'Nord' ELSE 'Sued' END,
        CASE WHEN i <= 6 THEN i ELSE i - 6 END
      ),
      ey_id,
      'structure',
      parent_site,
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

  -- 36 neue Linien: je 3 pro Struktur
  FOR i IN 1..12 LOOP
    FOR j IN 1..3 LOOP
      idx := idx + 1;
      cc := cc_ids[1 + ((idx - 1) % n_cc)];
      mf := mfr[1 + ((idx - 1) % 10)];
      bdate := (DATE '2016-06-01' + ((idx * 63) % 3300))::date;
      sn := format(
        'EY-EXT-%s-G%02s-L%s-%s',
        CASE WHEN i <= 6 THEN 'N' ELSE 'S' END,
        CASE WHEN i <= 6 THEN i ELSE i - 6 END,
        j,
        to_char(bdate, 'YYYYMM')
      );
      rm := CASE j
        WHEN 1 THEN 'Hauptlinie Automatik.'
        WHEN 2 THEN 'Sekundaerlinie fuer Rueckfluss.'
        ELSE 'Nacharbeit und Varianten.'
      END;

      INSERT INTO "asset" (
        "key", "name", "siteId", "type", "parentAssetId", "costCenterId",
        "serialNumber", "buildDate", "manufacturer", "remark", "createdBy", "updatedBy"
      )
      VALUES (
        format('EY-EXT-%s-G%02s-L%s', CASE WHEN i <= 6 THEN 'N' ELSE 'S' END, CASE WHEN i <= 6 THEN i ELSE i - 6 END, j),
        format('Erweiterungslinie %s G%s / Segment %s', CASE WHEN i <= 6 THEN 'Nord' ELSE 'Sued' END, CASE WHEN i <= 6 THEN i ELSE i - 6 END, j),
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

  -- 252 IH-Objekte: je 7 pro Linie
  FOR i IN 1..36 LOOP
    FOR k IN 1..7 LOOP
      idx := idx + 1;
      cc := cc_ids[1 + ((idx - 1) % n_cc)];
      mf := mfr[1 + ((idx - 1) % 10)];
      bdate := (DATE '2017-03-15' + ((idx * 71) % 2900))::date;
      sn := format('EY-EXT-LN%03s-K%02s-%s', i, k, to_char(bdate, 'YYYY'));
      rm := CASE (k % 4)
        WHEN 0 THEN 'Turnuspruefung halbjaehrlich.'
        WHEN 1 THEN 'Kritischer Pfad fuer OEE.'
        ELSE NULL
      END;

      INSERT INTO "asset" (
        "key", "name", "siteId", "type", "parentAssetId", "costCenterId",
        "serialNumber", "buildDate", "manufacturer", "remark", "createdBy", "updatedBy"
      )
      VALUES (
        format('EY-EXT-LN%03s-K%02s', i, k),
        CASE ((i + k) % 8)
          WHEN 0 THEN format('Hydraulikaggregat Erweiterung Linie %s', i)
          WHEN 1 THEN format('Robotermodul Erweiterung Linie %s', i)
          WHEN 2 THEN format('Pruefstation elektrisch Erweiterung Linie %s', i)
          WHEN 3 THEN format('Foerdertechnikmotor Erweiterung Linie %s', i)
          WHEN 4 THEN format('Kuehlkreislauf Erweiterung Linie %s', i)
          WHEN 5 THEN format('Sicherheitssteuerung Erweiterung Linie %s', i)
          WHEN 6 THEN format('Messmodul Laser Erweiterung Linie %s', i)
          ELSE format('Etikettierer Erweiterung Linie %s', i)
        END,
        ey_id,
        'maintenanceObject',
        ln_ids[i],
        cc,
        sn,
        bdate,
        mf,
        rm,
        v_admin,
        v_admin
      );
    END LOOP;
  END LOOP;

  IF idx <> 300 THEN
    RAISE EXCEPTION '017_seed_ey_additional_300_assets: interne Zaehlerinkonsistenz (idx=% statt 300)', idx;
  END IF;
END $$;
