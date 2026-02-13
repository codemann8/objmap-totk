<template>
  <section>
    <h2 class="location-sub">{{sub}}</h2>
    <div>Dungeon number: {{marker.data.dungeonNum}}</div>
    <div v-if="marker.data.lm.l.ShrineInCave" style="color: orange"><i class="fa fa-exclamation-circle"></i> Inside Cave</div>
    <section title="Warning: This is the marker position; actual Dungeon Position may be different ">Position: {{formatPosition(pos)}}</section>
    <hr>
    <section v-if="bgmObjs.length">
      <h4 class="subsection-heading">Shrine</h4>
      <div class="search-results">
        <ObjectInfo v-for="bgm in bgmObjs" :key="bgm.objid" :obj="bgm" :isChecked="isChecked(bgm)" />
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
    <section v-if="iceChunks.length">
      <h4 class="subsection-heading">Ice Chunks</h4>
      <div class="search-results">
        <ObjectInfo v-for="ice in iceChunks" :key="ice.objid" :obj="ice" :isChecked="isChecked(ice)" />
      </div>
    </section>
    <section v-if="thinIce.length">
      <h4 class="subsection-heading">Thin Ice</h4>
      <div class="search-results">
        <ObjectInfo v-for="ice in thinIce" :key="ice.objid" :obj="ice" :isChecked="isChecked(ice)" />
      </div>
    </section>

  </section>
</template>
<style lang="less">
</style>
<script src="./AppMapDetailsDungeon.ts"></script>
