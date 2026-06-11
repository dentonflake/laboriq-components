-- Retool BigQuery query: dictionary of program id → name.
--
-- No filtering — returns all programs. The transformer.js uses this as a
-- lookup map to add the program name to each row from the main inbound query.
-- Filtering down to active-at-this-location is handled in query.sql via
-- locationToPrograms, so this just needs to be a complete name dictionary.
--
-- Returns columns: id (number) | name (string)

SELECT
  id,
  name
FROM
  `your-project.your-dataset.programs`;
