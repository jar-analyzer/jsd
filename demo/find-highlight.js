export function clearMatches(root) {
  for (const mark of root.querySelectorAll('mark.find-match')) mark.replaceWith(...mark.childNodes);
  root.normalize();
}

export function highlightMatches(root, matches) {
  clearMatches(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let offset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    nodes.push({ node, start: offset, end: offset + node.length });
    offset += node.length;
  }
  let first = 0;
  for (const { node, start, end } of nodes) {
    while (first < matches.length && matches[first].end <= start) first++;
    if (!matches[first] || matches[first].start >= end) continue;
    const fragment = document.createDocumentFragment();
    let position = start;
    for (let i = first; i < matches.length && matches[i].start < end; i++) {
      const from = Math.max(start, matches[i].start);
      const to = Math.min(end, matches[i].end);
      fragment.append(node.textContent.slice(position - start, from - start));
      const mark = document.createElement('mark');
      mark.className = 'find-match';
      mark.dataset.hit = String(i);
      mark.textContent = node.textContent.slice(from - start, to - start);
      fragment.append(mark);
      position = to;
    }
    fragment.append(node.textContent.slice(position - start));
    node.replaceWith(fragment);
  }
}
