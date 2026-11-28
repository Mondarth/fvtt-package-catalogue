/** A node of a {@link Tree}: its own id and label, a detail beside it, and its children. */
export interface TreeNode {
  readonly id: string;
  readonly label: string;
  /** A short detail shown beside the label, such as a count or a status. */
  readonly detail?: string;
  /** Shown faded, as something retired is. */
  readonly muted?: boolean;
  readonly children?: readonly TreeNode[];
}

/** A row of a tree as it shows: its node, how deep, and its parent's id. */
export interface TreeRow {
  readonly node: TreeNode;
  readonly level: number;
  readonly parent: string | null;
}

/**
 * The rows a tree shows, in order: every node whose ancestors are all expanded.
 * @param nodes - The tree's top nodes
 * @param expanded - The ids of the nodes expanded
 * @returns The rows
 */
export function visibleRows(nodes: readonly TreeNode[], expanded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (list: readonly TreeNode[], level: number, parent: string | null) => {
    for (const node of list) {
      rows.push({ node, level, parent });
      if (node.children !== undefined && node.children.length > 0 && expanded.has(node.id)) {
        walk(node.children, level + 1, node.id);
      }
    }
  };
  walk(nodes, 1, null);
  return rows;
}

/**
 * The ids of every node that has children, as a tree opens fully expanded.
 * @param nodes - The tree's top nodes
 * @returns The ids
 */
export function parentIds(nodes: readonly TreeNode[]): string[] {
  return nodes.flatMap(node =>
    node.children !== undefined && node.children.length > 0 ? [node.id, ...parentIds(node.children)] : [],
  );
}
