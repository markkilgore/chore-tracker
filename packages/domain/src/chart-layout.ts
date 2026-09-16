// Layout v3 uses exact, shared inch measurements for print and scan manifests.
export function chartPageGeometry(rowCount: number, hasLesson: boolean) {
  const rowHeight = rowCount <= 4 ? 0.8 : rowCount <= 8 ? 0.6 : 0.42;
  const boxSize = rowCount <= 4 ? 0.36 : rowCount <= 8 ? 0.3 : 0.22;
  const lessonTop = 2.33 + Math.max(1, rowCount) * rowHeight + 0.3;
  return { rowHeight, boxSize, lessonTop, lessonHeight: 10.35 - lessonTop,
    stacked: hasLesson && rowCount <= 4 };
}
export function chartCheckboxBox(rowCount: number, row: number, column: number) {
  const { rowHeight, boxSize } = chartPageGeometry(rowCount, false);
  return { x: 0.5 + 2.52 + (column + 0.5) * (4.98 / 7) - boxSize / 2,
    y: 2.33 + (row + 0.5) * rowHeight - boxSize / 2, width: boxSize, height: boxSize };
}
