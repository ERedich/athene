-- Ca. 100 Ersatzteile mit Lagerplaetzen, Bestand und Bestandsplanung fuer Hauptlager (EY).
-- Idempotent: ueberspringt, wenn EY-ET-0001 bereits existiert.

DO $$
DECLARE
  v_admin uuid;
  ey_id uuid;
  wh_id uuid;
  loc_ids uuid[];
  n_loc int;
  i int;
  part_id uuid;
  loc_id uuid;
  qty numeric(14, 4);
  min_stock numeric(14, 4);
  reorder_lvl numeric(14, 4);
  order_qty numeric(14, 4);
  part_key text;
  part_name text;
  mfr text;
  art_no text;
  alt_desig text;
  aisle int;
  shelf int;
  loc_key text;
  names text[] := ARRAY[
    'Kugellager 6205-2RS',
    'Kugellager 6208-2RS',
    'Rollenlager NU208',
    'Wellenkupplung Groesse 19',
    'Wellenkupplung Groesse 28',
    'Keilriemen XPZ 1120',
    'Zahnriemen 8M-1200-30',
    'Hydraulikfilter 10 µm',
    'Hydraulikfilter 25 µm',
    'Druckluftfilter 5 µm',
    'O-Ring NBR 40x3',
    'O-Ring FKM 50x3',
    'Simmerring 35x52x7',
    'Flachdichtung DN50 PN16',
    'Pneumatikzylinder DSNU-32-100',
    'Pneumatikventil 5/2 G1/4',
    'Magnetventil 24V DC G1/8',
    'Druckminderer G1/4 0-10 bar',
    'Manometer 0-16 bar G1/4',
    'Naeherungssensor M12 PNP',
    'Naeherungssensor M18 PNP',
    'Lichtschranke Empfaenger',
    'Lichtschranke Sender',
    'Ultraschallsensor M30',
    'Temperatursensor PT100',
    'Drucksensor 0-10 bar 4-20mA',
    'Frequenzumrichter 1,5 kW',
    'Frequenzumrichter 5,5 kW',
    'Schuetz 24V DC 9A',
    'Motorschutzschalter 4-6,3A',
    'Sicherungsautomat C16',
    'Sicherungsautomat C20',
    'Not-Aus Taster komplett',
    'Relais 24V 2 Wechsler',
    'SPS-Eingangsmodul 16DI',
    'SPS-Ausgangsmodul 16DO',
    'Netzteil 24V 10A',
    'Netzteil 24V 20A',
    'Kabelverschraubung M20',
    'Kabelverschraubung M25',
    'Stecker M12 4-polig gerade',
    'Stecker M12 5-polig gewinkelt',
    'Sensorleitung M12 5m',
    'Sensorleitung M12 10m',
    'Gliederkette 08B-1',
    'Kettenrad 08B Z19',
    'Foerdergurt EP400/3 400mm',
    'Tragrolle 89x500',
    'Riemscheibe SPA 125',
    'Spannsatz Taper Lock 1610',
    'Getriebeoel ISO VG 220 20L',
    'Hydraulikoeel HLP 46 20L',
    'Fettpatrone NLGI 2',
    'Schmiernippel M8x1',
    'Schnellkupplung Hydraulik DN10',
    'Schlauchleitung 2SN DN12 1m',
    'Kugelhahn DN25 PN40',
    'Absperrklappe DN80',
    'Rueckschlagventil DN40',
    'Membranpumpe Ersatzmembran',
    'Kreiselpumpe Gleitringdichtung',
    'Laufrad Pumpe DN50',
    'Ventilsitz Edelstahl DN25',
    'Federpaket Kupplung Groesse 19',
    'Bremsbelag Scheibenbremse',
    'Bremsfeder Satz',
    'Carbonbuerste Motor 20x32',
    'Luefterrad Motor 132',
    'Kuehlkoerper Frequenzumrichter',
    'Entstoerfilter 1-phasig 16A',
    'Leitungsschutzrelais',
    'Ueberwachungsrelais Phasenfolge',
    'Softstarter 7,5 kW',
    'Encoder 1024 Imp/U',
    'Absolutwertgeber SSI',
    'Kupplungsstern Rotex 28',
    'Linearfuehrung Schlitten 15',
    'Kugelgewindetrieb 16x5 400mm',
    'Wellenlagerbock UCP205',
    'Flanschlager UCFL206',
    'Spannhuelse H2308',
    'Passfeder A 8x7x32',
    'Sechskantschraube M10x40 A2',
    'Sicherungsmutter M10 A2',
    'Unterlegscheibe 10 A2',
    'Sicherungsring DIN 471 30',
    'Sicherungsring DIN 472 40',
    'Pneumatikschlauch PU 8/6 blau',
    'Schnellsteckverbinder 8mm',
    'Drosselrueckschlagventil G1/4',
    'Wartungseinheit Filter+Oeler G1/4',
    'Zylinderdichtungssatz DSNU-32',
    'Ventilinsel Anschlussplatte',
    'IO-Link Master 8-Port',
    'RFID Lesekopf M18',
    'Sicherheitsschalter Zuhaltung',
    'Lichtgitter Empfaenger 600mm',
    'Lichtgitter Sender 600mm',
    'Sicherheitsrelais PNOZ',
    'Akku Handscanner Ersatz',
    'Druckluftwerkzeug Kupplung NW7,2',
    'Schweisserschutzglas Klar',
    'Schleifscheibe 125x6,4',
    'Trennscheibe 125x1,0'
  ];
  manufacturers text[] := ARRAY[
    'SKF GmbH',
    'SKF GmbH',
    'SKF GmbH',
    'KTR Systems GmbH',
    'KTR Systems GmbH',
    'Optibelt GmbH',
    'ContiTech AG',
    'Hydac International',
    'Hydac International',
    'Festo SE & Co. KG',
    'Parker Hannifin',
    'Parker Hannifin',
    'SKF GmbH',
    'Klinger GmbH',
    'Festo SE & Co. KG',
    'Festo SE & Co. KG',
    'Festo SE & Co. KG',
    'SMC Deutschland',
    'Wika Alexander Wiegand',
    'ifm electronic gmbh',
    'ifm electronic gmbh',
    'Sick AG',
    'Sick AG',
    'Pepperl+Fuchs SE',
    'Endress+Hauser',
    'ifm electronic gmbh',
    'Siemens AG',
    'Siemens AG',
    'Schneider Electric',
    'ABB Automation',
    'Siemens AG',
    'Siemens AG',
    'Schmersal GmbH',
    'Phoenix Contact',
    'Siemens AG',
    'Siemens AG',
    'Phoenix Contact',
    'Phoenix Contact',
    'Lapp GmbH',
    'Lapp GmbH',
    'Binder GmbH',
    'Binder GmbH',
    'ifm electronic gmbh',
    'ifm electronic gmbh',
    'iwis Antriebssysteme',
    'iwis Antriebssysteme',
    'Forbo Siegling',
    'Interroll GmbH',
    'Optibelt GmbH',
    'Fenner Drives',
    'Klueber Lubrication',
    'Shell Deutschland',
    'SKF GmbH',
    'SKF GmbH',
    'Parker Hannifin',
    'Parker Hannifin',
    'Gemue Gebr. Mueller',
    'Auma Riester',
    'Gestra AG',
    'Wilden Pump',
    'Grundfos GmbH',
    'Grundfos GmbH',
    'Samson AG',
    'KTR Systems GmbH',
    'Mayr Antriebstechnik',
    'Mayr Antriebstechnik',
    'Schunk Kohlenstofftechnik',
    'ebm-papst',
    'Siemens AG',
    'Schaffner EMV',
    'Phoenix Contact',
    'Schneider Electric',
    'ABB Automation',
    'Heidenhain',
    'Pepperl+Fuchs SE',
    'KTR Systems GmbH',
    'Bosch Rexroth AG',
    'Bosch Rexroth AG',
    'SKF GmbH',
    'SKF GmbH',
    'SKF GmbH',
    'DIN Standard',
    'DIN Standard',
    'DIN Standard',
    'DIN Standard',
    'DIN Standard',
    'DIN Standard',
    'Festo SE & Co. KG',
    'Festo SE & Co. KG',
    'Festo SE & Co. KG',
    'Festo SE & Co. KG',
    'Festo SE & Co. KG',
    'Festo SE & Co. KG',
    'ifm electronic gmbh',
    'Pepperl+Fuchs SE',
    'Schmersal GmbH',
    'Sick AG',
    'Sick AG',
    'Pilz GmbH',
    'Zebra Technologies',
    'Rectus GmbH',
    '3M Deutschland',
    'Norton Abrasives',
    'Norton Abrasives'
  ];
BEGIN
  SELECT u."id" INTO v_admin FROM "users" u WHERE u."loginName" = 'admin' LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION '076_seed_ey_hauptlager_spare_parts: kein Benutzer admin';
  END IF;

  SELECT s."id" INTO ey_id FROM "site" s WHERE s."key" = 'EY' LIMIT 1;
  IF ey_id IS NULL THEN
    RAISE NOTICE '076_seed_ey_hauptlager_spare_parts: Standort EY nicht gefunden - uebersprungen';
    RETURN;
  END IF;

  SELECT w."id" INTO wh_id
  FROM "warehouse" w
  WHERE w."siteId" = ey_id
    AND w."isActive" = true
    AND (
      w."key" ILIKE 'Hauptlager'
      OR w."name" ILIKE 'Hauptlager'
      OR w."name" ILIKE '%Hauptlager%'
    )
  ORDER BY w."key"
  LIMIT 1;

  IF wh_id IS NULL THEN
    RAISE NOTICE '076_seed_ey_hauptlager_spare_parts: kein Hauptlager fuer EY gefunden - uebersprungen';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM "sparePart" sp WHERE sp."key" = 'EY-ET-0001') THEN
    RAISE NOTICE '076_seed_ey_hauptlager_spare_parts: Seed bereits vorhanden - uebersprungen';
    RETURN;
  END IF;

  IF cardinality(names) <> cardinality(manufacturers) THEN
    RAISE EXCEPTION '076_seed_ey_hauptlager_spare_parts: Katalog inkonsistent (names=%, mfr=%)',
      cardinality(names), cardinality(manufacturers);
  END IF;

  -- Lagerplaetze Regal R1..R5, Fach F1..F8 (40 Plaetze; bestehende R1F4/R2F8 bleiben)
  FOR aisle IN 1..5 LOOP
    FOR shelf IN 1..8 LOOP
      loc_key := format('R%sF%s', aisle, shelf);
      INSERT INTO "storageLocation" (
        "key",
        "warehouseId",
        "maxLoadKg",
        "heightMm",
        "widthMm",
        "depthMm",
        "isActive",
        "createdBy",
        "updatedBy"
      )
      VALUES (
        loc_key,
        wh_id,
        CASE WHEN aisle <= 2 THEN 800 ELSE 500 END,
        CASE WHEN shelf <= 4 THEN 400 ELSE 600 END,
        800,
        600,
        true,
        v_admin,
        v_admin
      )
      ON CONFLICT ("warehouseId", "key") DO NOTHING;
    END LOOP;
  END LOOP;

  SELECT array_agg(sl."id" ORDER BY sl."key")
  INTO loc_ids
  FROM "storageLocation" sl
  WHERE sl."warehouseId" = wh_id
    AND sl."isActive" = true;

  IF loc_ids IS NULL OR cardinality(loc_ids) = 0 THEN
    RAISE EXCEPTION '076_seed_ey_hauptlager_spare_parts: keine Lagerplaetze im Hauptlager';
  END IF;

  n_loc := cardinality(loc_ids);

  FOR i IN 1..cardinality(names) LOOP
    part_key := 'EY-ET-' || lpad(i::text, 4, '0');
    part_name := names[i];
    mfr := manufacturers[i];
    art_no := 'ART-' || (1000 + i)::text;
    alt_desig := CASE
      WHEN i % 5 = 0 THEN 'Alt: ' || part_name
      ELSE NULL
    END;

    INSERT INTO "sparePart" (
      "key",
      "name",
      "siteId",
      "isActive",
      "serialNumber",
      "classificationId",
      "manufacturer",
      "articleNumber",
      "alternativeDesignation",
      "createdBy",
      "updatedBy"
    )
    VALUES (
      part_key,
      part_name,
      ey_id,
      true,
      CASE WHEN i % 11 = 0 THEN 'SN-ET-' || lpad(i::text, 4, '0') ELSE NULL END,
      NULL,
      mfr,
      art_no,
      alt_desig,
      v_admin,
      v_admin
    )
    RETURNING "id" INTO part_id;

    loc_id := loc_ids[1 + ((i - 1) % n_loc)];
    qty := (5 + ((i * 7) % 76))::numeric;
    min_stock := greatest(1, floor(qty * 0.25))::numeric;
    reorder_lvl := greatest(min_stock + 1, floor(qty * 0.45))::numeric;
    order_qty := greatest(reorder_lvl, (10 + ((i * 3) % 40))::numeric);

    INSERT INTO "stockControl" (
      "sparePartId",
      "warehouseId",
      "storageLocationId",
      "quantity",
      "createdBy",
      "updatedBy"
    )
    VALUES (part_id, wh_id, loc_id, qty, v_admin, v_admin);

    -- Bestandsplanung auf Lagerebene (Hauptlager)
    INSERT INTO "sparePartStockPolicy" (
      "sparePartId",
      "scopeType",
      "warehouseId",
      "storageLocationId",
      "reorderLevel",
      "minStock",
      "orderQuantity",
      "createdBy",
      "updatedBy"
    )
    VALUES (
      part_id,
      'WAREHOUSE',
      wh_id,
      NULL,
      reorder_lvl,
      min_stock,
      order_qty,
      v_admin,
      v_admin
    );

    -- Jedes 4. Teil zusaetzlich mit lagerplatzspezifischer Feinplanung
    IF i % 4 = 0 THEN
      INSERT INTO "sparePartStockPolicy" (
        "sparePartId",
        "scopeType",
        "warehouseId",
        "storageLocationId",
        "reorderLevel",
        "minStock",
        "orderQuantity",
        "createdBy",
        "updatedBy"
      )
      VALUES (
        part_id,
        'STORAGE_LOCATION',
        wh_id,
        loc_id,
        greatest(1, floor(reorder_lvl * 0.8))::numeric,
        greatest(1, floor(min_stock * 0.8))::numeric,
        order_qty,
        v_admin,
        v_admin
      );
    END IF;
  END LOOP;

  RAISE NOTICE '076_seed_ey_hauptlager_spare_parts: % Ersatzteile mit Bestand und Planung fuer Hauptlager angelegt',
    cardinality(names);
END $$;
