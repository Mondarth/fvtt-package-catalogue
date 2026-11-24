<!-- A date and time, written as `useDates` writes them, under the locale given, as the root layout sets it. -->
<script lang="ts">
  import { setDateLocale, useDates } from '../../../src/lib/dates.js';

  let { locale, when }: { locale: string | null; when: Date } = $props();

  // Set once, as the root layout does: a component's context is fixed as it is made.
  // svelte-ignore state_referenced_locally
  if (locale !== null) setDateLocale(() => locale);
  const { date, dateTime } = useDates();
</script>

<span data-testid="date">{date(when)}</span>
<span data-testid="time">{dateTime(when)}</span>
