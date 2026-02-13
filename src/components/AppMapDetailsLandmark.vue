<template>
  <section>
    <section title="Marker position">Position: {{formatPosition(pos)}}</section>
    <hr>
    <section v-if="objs.length">
      <div class="search-results">
        <ObjectInfo v-for="obj in objs" :key="obj.hash_id" :obj="obj" :isChecked="isChecked(obj)" />
      </div>
    </section>
  </section>
</template>
<style lang="less">
</style>
<script src="./AppMapDetailsLandmark.ts"></script>
