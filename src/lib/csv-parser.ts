export function parseCsvRecords(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;

  const pushField = () => {
    row.push(field);
    field = "";
    fieldStarted = false;
  };

  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      if (fieldStarted && field.trim() !== "") {
        throw new Error("Unexpected quote inside an unquoted CSV field.");
      }
      if (fieldStarted) {
        field = "";
      }
      inQuotes = true;
      fieldStarted = true;
      continue;
    }

    if (char === ",") {
      pushField();
      continue;
    }

    if (char === "\n") {
      pushRow();
      continue;
    }

    if (char === "\r") {
      if (text[index + 1] === "\n") index += 1;
      pushRow();
      continue;
    }

    field += char;
    fieldStarted = true;
  }

  if (inQuotes) {
    throw new Error("Unclosed quoted CSV field.");
  }

  if (field.length > 0 || row.length > 0 || fieldStarted) {
    pushRow();
  }

  return rows.filter((record) =>
    record.some((value) => value.trim().length > 0),
  );
}
