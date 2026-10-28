/** Field-local BM25 (k1 = 1.2, b = 0.75). Each document is one entry's field. */
export function bm25(
  documents: ReadonlyArray<ReadonlyArray<string>>,
  query: ReadonlyArray<string>,
): number[] {
  const average = documents.reduce((sum, doc) => sum + doc.length, 0) / (documents.length || 1);
  const frequencies = new Map(
    query.map((word) => [word, documents.filter((doc) => doc.includes(word)).length]),
  );
  return documents.map((doc) =>
    query.reduce((sum, word) => {
      const frequency = doc.filter((token) => token === word).length;
      if (frequency === 0) return sum;
      const count = frequencies.get(word) ?? 0;
      const idf = Math.log(1 + (documents.length - count + 0.5) / (count + 0.5));
      return (
        sum +
        (idf * frequency * 2.2) / (frequency + 1.2 * (0.25 + (0.75 * doc.length) / (average || 1)))
      );
    }, 0),
  );
}
