
<script setup lang="ts">
import { reactive, ref, Ref } from 'vue';
import { COLOR_TYPE } from '@/scripts/const';
import { useColorStore } from '@/stores/color';

const colorStore = useColorStore();


const dialog: Ref<HTMLElement | null> = ref(null); 
const text: Ref<string> = ref("");
const isShown: Ref<boolean> = ref(false);

const showEffect = (content: string, timeout: number) => {
    text.value = content;
    isShown.value = true;
    setTimeout(() => {
        isShown.value = false;
    }, timeout);
}

const listShow: Array<string> = reactive([])
const add = (content: string, timeout: number) => {
    listShow.push(content);
    console.log(content);
    setTimeout(() => {
       listShow.shift(); 
    }, timeout);
}
// APIを公開
defineExpose({
  add,
  showEffect
})

</script>


<template>
    <Transition name="fade">
        <div ref="dialog" class="base_effect_complete" v-show="isShown">
            {{ text }}
        </div>
    </Transition>
    <div class="base_effect_complete">
        <TransitionGroup name="slide">
            <div v-for="value in listShow" 
                :key="value"
                class="list_effect_item">　</div>
            
        </TransitionGroup>    
    </div>
    <div class="base_effect_complete">
        <TransitionGroup name="fade">
            <div v-for="value in listShow" 
                :key="value"
                class="list_effect_item">{{ value }}</div>
        </TransitionGroup>      
    </div>           

</template>

<style scoped>
.base_effect_complete {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 0;
  transition: 1s;
  z-index: 10;
}
.list_effect_item{
    font-size: large;
    margin: 10px;
    width: 50vw;
    text-align: center;
    color: v-bind(colorStore.getColorBy(COLOR_TYPE.onSecondary));
    background-color: v-bind(colorStore.getColorBy(COLOR_TYPE.secondary));
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.5s ease;
}
.slide-enter-from{
  transform: translateX(-50%) scaleX(0);
}

.slide-leave-to{
    transform: translateX(50%) scaleX(0);
}
/* これらのクラスが何をするかは後ほど説明します! */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>