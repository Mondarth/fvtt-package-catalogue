<!--
  The services a subscription gives access to, as a tree: access to one gives access to every one under it. A service's menu, from a
  right-click, Shift+F10 or the Menu key, or its "⋯" button, adds one under it; a button adds one at the top. The one
  selected shows beside the tree.
-->
<script lang="ts">
  import { Button, Dialog, Field, Notice, Tree } from '@mondarth/ui';
  import type { TreeNode } from '@mondarth/ui';

  import { m } from '#lib/paraglide/messages.js';
  import { useDates } from '#lib/dates.js';

  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const dates = useDates();

  type Service = (typeof data.services)[number];

  /**
   * The services as the tree's nodes: under their parents, by name, with how many offers each has.
   * @param parentId - Whose to take
   * @returns The nodes
   */
  function nodesUnder(parentId: string | null): TreeNode[] {
    return data.services
      .filter(service => service.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(service => ({
        id: service.id,
        label: service.name,
        detail:
          service.retiredAt === null ? m.admin_service_offers({ count: service.offers }) : m.admin_service_retired(),
        muted: service.retiredAt !== null,
        children: nodesUnder(service.id),
      }));
  }

  const nodes = $derived(nodesUnder(null));
  const byId = $derived(new Map(data.services.map(service => [service.id, service])));

  // The one just added, or else the first, selected; a failed addition opens its form again, saying why.
  let selected = $state<string | null>(null);
  $effect.pre(() => {
    selected ??= data.added ?? data.services.find(e => e.parentId === null)?.id ?? null;
  });
  const shown = $derived(selected === null ? undefined : byId.get(selected));

  /** Where a service is being added: under one, or at the top; none while the form is closed. */
  let adding = $state<{ parent: Service | null } | null>(null);
  $effect.pre(() => {
    if (form?.problem !== undefined) adding = { parent: byId.get(form.parent) ?? null };
  });

  const PROBLEMS = {
    name: m.admin_service_problem_name,
    id: m.admin_service_problem_id,
    taken: m.admin_service_problem_taken,
    description: m.admin_service_problem_description,
    'no-parent': m.admin_service_problem_parent,
  } as const;
  const problemOf = (fieldName: 'name' | 'id' | 'description') => {
    const problem = form?.problem;
    if (problem === undefined) return undefined;
    // The one it was to go under being gone is said above the form: it is no field's.
    const field = problem === 'taken' ? 'id' : problem;
    return field === fieldName ? PROBLEMS[problem]() : undefined;
  };
</script>

<svelte:head>
  <title>{m.admin_services_heading()} · {m.site_title()}</title>
</svelte:head>

<h1>{m.admin_services_heading()}</h1>
<p class="lede">{m.admin_services_lede()}</p>

<div class="services">
  <section class="tree" aria-labelledby="services-tree">
    <h2 id="services-tree" class="mdr-visually-hidden">{m.admin_services_tree()}</h2>
    <Tree
      {nodes}
      label={m.admin_services_tree()}
      bind:selected
      menuLabel={(node: TreeNode) => m.admin_service_menu({ name: node.label })}
      menu={(node: TreeNode) => {
        const service = byId.get(node.id);
        return service?.retiredAt !== null
          ? []
          : [
              {
                label: m.admin_service_add(),
                onSelect: () => {
                  adding = { parent: service };
                },
              },
            ];
      }} />
    <p>
      <Button
        variant="secondary"
        onclick={() => {
          adding = { parent: null };
        }}>{m.admin_service_add_top()}</Button>
    </p>
  </section>

  {#if shown !== undefined}
    <section class="detail" aria-labelledby="service-name">
      <h2 id="service-name">{shown.name}</h2>
      {#if shown.description !== null}
        <p>{shown.description}</p>
      {/if}
      <dl>
        <dt>{m.admin_service_id()}</dt>
        <dd><code>{shown.id}</code></dd>
        <dt>{m.admin_service_under()}</dt>
        <dd>
          {shown.parentId === null ? m.admin_service_top() : (byId.get(shown.parentId)?.name ?? shown.parentId)}
        </dd>
        <dt>{m.admin_service_gives()}</dt>
        <dd>
          {data.services.some(e => e.parentId === shown.id)
            ? m.admin_service_gives_under()
            : m.admin_service_gives_itself()}
        </dd>
        <dt>{m.admin_service_offered()}</dt>
        <dd>{shown.offers}</dd>
        <dt>{m.admin_service_made()}</dt>
        <dd>{dates.date(new Date(shown.createdAt))}</dd>
      </dl>
    </section>
  {/if}
</div>

<Dialog
  open={adding !== null}
  title={adding?.parent == null ? m.admin_service_add_top() : m.admin_service_add_under({ name: adding.parent.name })}>
  <form method="POST" action="?/add" id="add-service">
    <input type="hidden" name="parent" value={adding?.parent?.id ?? ''} />
    {#if form?.problem === 'no-parent'}
      <Notice type="warning">{PROBLEMS['no-parent']()}</Notice>
    {/if}
    <Field id="service-name-field" label={m.admin_service_name()} problem={problemOf('name')}>
      {#snippet children(field)}
        <input {...field} name="name" required maxlength="80" value={form?.name ?? ''} />
      {/snippet}
    </Field>
    <Field
      id="service-id-field"
      label={m.admin_service_id()}
      hint={m.admin_service_id_hint()}
      problem={problemOf('id')}>
      {#snippet children(field)}
        <input {...field} name="id" maxlength="40" pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form?.id ?? ''} />
      {/snippet}
    </Field>
    <Field id="service-description-field" label={m.admin_service_description()} problem={problemOf('description')}>
      {#snippet children(field)}
        <textarea {...field} name="description" rows="3" maxlength="500">{form?.description ?? ''}</textarea>
      {/snippet}
    </Field>
  </form>
  {#snippet actions()}
    <Button type="submit" form="add-service">{m.admin_service_add()}</Button>
    <Button
      variant="secondary"
      onclick={() => {
        adding = null;
      }}>{m.admin_service_cancel()}</Button>
  {/snippet}
</Dialog>

<style>
  .lede {
    color: var(--mdr-color-text-muted);
  }

  .services {
    display: grid;
    grid-template-columns: minmax(16rem, 1fr) 2fr;
    gap: var(--mdr-space-6);
    align-items: start;
  }

  @media (max-width: 48rem) {
    .services {
      grid-template-columns: 1fr;
    }
  }

  .detail h2 {
    margin-top: 0;
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--mdr-space-2) var(--mdr-space-4);
  }

  dt {
    font-weight: var(--mdr-font-weight-strong);
  }

  dd {
    margin: 0;
  }
</style>
