<template>
  <div class="tracker-root">
    <table class="tracker-table">
      <tr v-for="list in lists" :key="list.id || list.name" class="tracker-row">
        <td class="tracker-name">{{ list.name }}</td>
        <td class="tracker-counts">{{ listCounts(list) }}</td>
        <td class="tracker-percent">{{ listPercent(list) }}</td>
      </tr>
      <tr class="tracker-row tracker-total">
        <td class="tracker-percent tracker-total-percent">{{ overallPercent }}</td>
        <td class="tracker-counts tracker-total-counts" colspan="2">{{ overallCounts }}</td>
      </tr>
    </table>
  </div>
</template>

<style>
/* Override global body background so OBS sees transparency */
body.tracker-page {
  background: transparent !important;
  background-color: #880000 !important;
  background-image: none !important;
}
</style>

<style scoped>
.tracker-root {
  display: inline-block;
  color: #ffffff;
  font-family: "Segoe UI", Arial, sans-serif;
  font-size: 14px;
  font-weight: 700;
  padding: 8px 10px;
  background: transparent;
  text-shadow:
    -1px -1px 0 #000,
     1px -1px 0 #000,
    -1px  1px 0 #000,
     1px  1px 0 #000,
     0 0 3px #000;
}

.tracker-table {
  border-collapse: separate;
  border-spacing: 10px 0;
  margin-left: -10px;
}

.tracker-row td {
  padding: 0px 0;
  white-space: nowrap;
}

.tracker-name {
}

.tracker-counts {
  text-align: right;
}

.tracker-percent {
  text-align: right;
}

.tracker-total td {
  padding-top: 0px;
  border-top: 1px none rgba(255, 255, 255, 0.3);
}

.tracker-total-counts {
  font-weight: 800;
  text-align: left;
}

.tracker-total-percent {
  font-weight: 900;
  font-size: 2em;
  text-align: left;
}
</style>

<script src="./ChecklistOverlay.ts"></script>
