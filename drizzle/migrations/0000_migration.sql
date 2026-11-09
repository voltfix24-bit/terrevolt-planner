ALTER TABLE public.opdrachtgevers
  ADD COLUMN IF NOT EXISTS bedrijfsnaam text,
  ADD COLUMN IF NOT EXISTS adres text,
  ADD COLUMN IF NOT EXISTS postcode_plaats text,
  ADD COLUMN IF NOT EXISTS telefoon text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS website text;
UPDATE public.opdrachtgevers SET bedrijfsnaam='Van Gelder Kabel-, Leiding- en Montagewerken B.V.', adres='Sluiswachter 18', postcode_plaats='3861 SN NIJKERK GLD', telefoon='088 - 115 40 00', email='info@vangelder.com', website='www.vangelder.com' WHERE id='0d3e8d69-59a3-4575-8bb6-32f440094a52';