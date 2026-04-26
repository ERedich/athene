-- Align GN-ASC German copy with UI terminology (Buchungskreis); existing DBs skip INSERT changes from 010.

UPDATE "appParameter"
SET
  "nameDe" = 'Wahl des Buchungskreises',
  "descriptionDe" = 'Wenn aktiv (Y), dürfen Benutzer den Buchungskreis bei Stammdaten (z. B. Assets, Kostenstellen) selbst wählen und ändern. Wenn inaktiv (N), setzt das System den Buchungskreis bei Neuanlagen auf den Arbeitsbuchungskreis des Benutzers; bei bestehenden Datensätzen bleibt der gespeicherte Buchungskreis erhalten und das Feld ist nicht editierbar.',
  "updatedAt" = now()
WHERE "key" = 'GN-ASC';
