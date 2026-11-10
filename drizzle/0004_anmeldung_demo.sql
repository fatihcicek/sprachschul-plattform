-- Demo-Anmeldung: Vor der Anmeldung ist die Schule noch nicht bekannt. Diese eine,
-- schmale Regel erlaubt es, eine Schule über ihren Kurznamen zu finden, wenn die
-- Verbindung app.lookup_slug gesetzt hat. Sie gibt nur diese eine Zeile frei.
CREATE POLICY slug_lookup ON organizations FOR SELECT
  USING (slug = nullif(current_setting('app.lookup_slug', true), ''));
