<template>
  <section>
    <h2 class="location-sub">{{ marker.data.title }}</h2>
    <ObjectInfo v-if="objs.length" :obj="objs[0]" :key="objs[0].hash_id" className="obj-main-info" withPermalink :isChecked="isChecked(objs[0])"/>
    <section>Location ID: {{ locationId }}</section>
    <section title="Marker position">Position: {{ formatPosition(pos) }}</section>
    <hr>

    <section v-if="shrines.length">
      <h4 class="subsection-heading">Shrines</h4>
      <div class="search-results">
        <ObjectInfo
          v-for="s in shrines"
          :key="s.objid"
          :obj="s"
          :is-static="false"
          :isChecked="isChecked(s)"
          @click.native.stop.prevent="openShrineDetails(s)"
        />
      </div>
    </section>

    <section v-if="bubbulfrogObjs.length">
      <h4 class="subsection-heading">Bubbulfrog</h4>
      <div class="search-results">
        <ObjectInfo v-for="b in bubbulfrogObjs" :key="b.objid" :obj="b" :isChecked="isChecked(b)" />
      </div>
    </section>

    <section v-if="tboxObjs.length">
      <h4 class="subsection-heading">Treasure Chests</h4>
      <div class="search-results">
        <ObjectInfo v-for="tbox in tboxObjs" :key="tbox.objid" :obj="tbox" drop-as-name :isChecked="isChecked(tbox)" />
      </div>
    </section>

    <section v-if="enemies.length">
      <h4 class="subsection-heading">Enemies</h4>
      <div class="search-results">
        <ObjectInfo v-for="enemy in enemies" :key="enemy.objid" :obj="enemy" :isChecked="isChecked(enemy)" />
      </div>
    </section>

    <section v-if="npcs.length">
      <h4 class="subsection-heading">NPCs</h4>
      <div class="search-results">
        <ObjectInfo v-for="npc in npcs" :key="npc.objid" :obj="npc" :isChecked="isChecked(npc)" />
      </div>
    </section>

    <section v-if="hardSediments.length">
      <h4 class="subsection-heading">Hard Sediments</h4>
      <div class="search-results">
        <ObjectInfo v-for="hardSediment in hardSediments" :key="hardSediment.objid" :obj="hardSediment" :isChecked="isChecked(hardSediment)" />
      </div>
    </section>

    <section v-if="wallCracks.length">
      <h4 class="subsection-heading">Cracked Rocks</h4>
      <div class="search-results">
        <ObjectInfo v-for="wallCrack in wallCracks" :key="wallCrack.objid" :obj="wallCrack" :isChecked="isChecked(wallCrack)" />
      </div>
    </section>

    <section v-if="vines.length">
      <h4 class="subsection-heading">Vines</h4>
      <div class="search-results">
        <ObjectInfo v-for="vine in vines" :key="vine.objid" :obj="vine" :isChecked="isChecked(vine)" />
      </div>
    </section>

    <section v-if="sandPiles.length">
      <h4 class="subsection-heading">Sand Piles</h4>
      <div class="search-results">
        <ObjectInfo v-for="sandPile in sandPiles" :key="sandPile.objid" :obj="sandPile" :isChecked="isChecked(sandPile)" />
      </div>
    </section>

    <section v-if="iceWalls.length">
      <h4 class="subsection-heading">Ice Walls</h4>
      <div class="search-results">
        <ObjectInfo v-for="ice in iceWalls" :key="ice.objid" :obj="ice" :isChecked="isChecked(ice)" />
      </div>
    </section>

    <section v-if="thinIce.length">
      <h4 class="subsection-heading">Thin Ice</h4>
      <div class="search-results">
        <ObjectInfo v-for="ice in thinIce" :key="ice.objid" :obj="ice" :isChecked="isChecked(ice)" />
      </div>
    </section>

    <section v-if="!shrines.length && !tboxObjs.length && !bubbulfrogObjs.length && !enemies.length && !hardSediments.length && !wallCracks.length && !iceWalls.length && !thinIce.length" style="opacity: 0.8;">
      No cave interior data found for this location.
    </section>
  </section>
</template>
<style lang="less">
.obj-main-info {
  font-size: 90%;
  .search-result-name {
    display: none;
  }
}
</style>
<script src="./AppMapDetailsCave.ts"></script>
