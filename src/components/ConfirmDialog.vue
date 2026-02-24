<script setup lang="ts">
import { onMounted, onUnmounted, Ref, ref } from 'vue'
import { BUTTON_TYPE, DIALOG_TYPE, RESPONSE_TYPE } from '@/scripts/const'
import { useColorStore } from '@/stores/color';
import { COLOR_TYPE } from '@/scripts/const';
import ButtonMain from './ButtonMain.vue';
import IconBase from './IconTemplate.vue';
import IconTemplate from './IconTemplate.vue';
import IconAlert from './icons/IconAlert.vue';
import IconInfo from './icons/IconInfo.vue';
import IconError from './icons/IconError.vue';

const colorStore = useColorStore();

// APIを公開
defineExpose({
  openDialog
})

// dialogの参照を保持する変数
const dialog = ref<HTMLDialogElement | null>(null)
const open = ref(false)

const hasOK: Ref<boolean> = ref(false);
const hasCancel: Ref<boolean> = ref(false);
const title: Ref<string> = ref("");
const detail: Ref<string> = ref("");
const dialogPattern: Ref<string> = ref("");

// Promiseのresolveをキャッシュ
let resolve: (action: 'cancel' | 'close') => void

// 外部に公開するAPI。ダイアログを開いて、終了
async function openDialog(dialogType :string, inputTitle: string, inputDetail: string) {
    dialogPattern.value = dialogType;
    switch(dialogType){
        case DIALOG_TYPE.ERROR:
            hasOK.value = true;
            hasCancel.value = false;
            break;    
        case DIALOG_TYPE.INFO:
            hasOK.value = true;
            hasCancel.value = false;
            break;
        case DIALOG_TYPE.ALERT:
            hasOK.value = true;
            hasCancel.value = true;
            break;
    }
    title.value = inputTitle;
    detail.value = inputDetail;

  open.value = true
  dialog?.value?.showModal()
  const promise = new Promise<'cancel' | 'close'>((res) => {
    resolve = res
  })

  const result = await promise
  dialog?.value?.close()
  open.value = false
  return result
}

// ダイアログ側の閉じるボタンが押されたときに呼ばれるコールバック
function onDialogAction(action: 'cancel' | 'close') {
  resolve(action)
}

// escapeキーで閉じるのをフックして、実装しようとする終了と同じ流れに載せる
function handleEscape(event: Event) {
  event.preventDefault()
  resolve('cancel')
}

onMounted(() => {
  dialog.value?.addEventListener('cancel', handleEscape)
})

onUnmounted(() => {
  dialog.value?.removeEventListener('cancel', handleEscape)
})
</script>

<template>
  <dialog ref="dialog" class="modal_dialog">
    <div v-if="open">
        <div class="modal_title">{{ title }}</div>
        <div class="modal_icon">
            <IconTemplate>
                <IconInfo v-if="dialogPattern==DIALOG_TYPE.INFO"/>
                <IconAlert v-if="dialogPattern==DIALOG_TYPE.ALERT"/>
                <IconError v-if="dialogPattern==DIALOG_TYPE.ERROR"/>
            </IconTemplate>
        </div>
        <div class="modal_content">{{ detail }}</div>
      <div class="modal_action">
        <ButtonMain :button-type="BUTTON_TYPE.PRIMARY" class="modal_button" v-if="hasOK" v-on:click="onDialogAction('close')">OK</ButtonMain> 
        <ButtonMain :button-type="BUTTON_TYPE.SECONDARY" class="modal_button" v-if="hasCancel" v-on:click="onDialogAction('cancel')">Cancel</ButtonMain>
      </div>
    </div>
  </dialog>
</template>

<style scoped>

.modal_dialog {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 0;
}
.modal_title{
    padding: 0 0 0 10px;
    background-color: v-bind(colorStore.getColorBy(COLOR_TYPE.secondaryHeavy));
}
.modal_content{
    padding: 10px;
    white-space: pre-wrap;
    background-color: v-bind(colorStore.getColorBy(COLOR_TYPE.secondary));
}
.modal_action {
    display: flex;
    flex-direction: row;
    width: 100%;
    background-color: v-bind(colorStore.getColorBy(COLOR_TYPE.background));
}
.modal_button {
    width: 100%;
    margin: 5px;
}
.modal_icon {
    display: flex;
    justify-content: center;
}
</style>
