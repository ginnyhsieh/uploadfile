/* Firebase 初始化
-------------------------------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.8.2/firebase-app.js";
import { getStorage, ref, uploadBytes, listAll } from "https://www.gstatic.com/firebasejs/9.8.2/firebase-storage.js";


const firebaseConfig = {
  apiKey: "AIzaSyDt3QDREvQ5v1-MzgpO_-24DLchlZ_c7tw",
  authDomain: "uploadfile-a985c.firebaseapp.com",
  projectId: "uploadfile-a985c",
  storageBucket: "uploadfile-a985c.appspot.com",
  messagingSenderId: "812443816909",
  appId: "1:812443816909:web:d0d17ba668a18501f46a84"
};

const firebaseApp = initializeApp(firebaseConfig);
const storage = getStorage(firebaseApp);

/* -------------------------------- */

const App = {
  setup() {
    
    let files = Vue.ref([]);
    let filesSet = Vue.ref([]);
    let cropFiles = Vue.ref([]);
    let errorMessageSet = Vue.ref([]);
    let showPreview = Vue.ref(false);
    let showPrimaryUpload = Vue.ref(true);
    let showSecondaryUpload = Vue.ref(false);

    function preventDefault(event) {
      event.preventDefault(); // 取消預設事件，防止拖拉直接開啟檔案
    }

    async function loadFile(event) {
      errorMessageSet.value.splice(0, errorMessageSet.value.length);
      preventDefault(event);
      files.value = event.target.files || event.dataTransfer.files;
      
      let test = await new Promise((resolve) => {
        Object.keys(files.value).forEach(item => {
          resolve(checkFile(files.value[item])) ;
        })  
      });
      
      if(errorMessageSet.value.length != 0) {
        errorMessage(errorMessageSet.value);
      }
      else if(!(event.dataTransfer && event.dataTransfer.types.includes('text/plain'))) { // 如果拖曳是文字類型的東西，那就不能顯示 Modal
        showPreview.value = true;
        showPrimaryUpload.value = false;
        showSecondaryUpload.value = true;  
        cropModal.show();
      }
      zipFile();
      event.target.value = ''; // 將 input 那裡的檔案資料清空。避免 drag 更新檔案後，input 因保有舊資料而無法觸發 change 事件
    }


    async function checkFile(singleFile) {
      let message = [];
      
      // 檢查檔案大小
      // const maxFileSize = 3072; // 1M = 1024KB
      // const fileSizeKB = singleFile.size / 1024; // 單位：KB
      // const isValidSize = fileSizeKB <= maxFileSize;
      // if (!isValidSize) {
      //   message.push("檔案大小不能超過 3M");
      // }

      // 檢查檔案格式
      const allowFileType = ['image/jpg','image/jpeg','image/png','heic','heif'];
      const fileType = singleFile.type || singleFile.name.split('.')[1];
      const isValidType = allowFileType.includes(fileType)
      if (!isValidType) {
        message.push("檔案格式需為 jpg / png / heic / heif");
      }

      // 轉檔
      if(['heic', 'heif'].includes(fileType)) {
        singleFile = await convertFile();
      }

      async function convertFile() {
        const conversionResult = await heic2any({blob: singleFile,toType: "image/jpeg",})
        let newFile = new File([conversionResult], singleFile.name.split('.')[0] + ".jpg", {
          type: "image/jpeg",
        })
        return newFile;
      }

      // 壓縮圖片長寬
      async function compressImage(singleFile) {
        let src = await getPreviewSrc(singleFile);
        let info = await new Promise((resolve) => {
          let image = new Image();
          image.src = src;
          image.onload = function() {
            let canvas = document.createElement('canvas');
            let context = canvas.getContext('2d');
            let imageWidth = 800;
            let imageHeight = 800;
            if(image.width >= imageWidth || image.height >= imageWidth) {
              if(image.width >= image.height) {
                imageHeight = image.height * (imageWidth / image.width);
              }
              else {
                imageWidth = image.width * (imageHeight / image.height);
              }
              canvas.width = imageWidth;
              canvas.height = imageHeight;
              context.fillStyle = '#fff';
              context.fillRect(0, 0, canvas.width, canvas.height);
              context.drawImage(image, 0, 0, imageWidth, imageHeight);
              let imageData = {
                // 再變成"image/jpg"
                base64: canvas.toDataURL(singleFile.type || "image/jpeg"),
                fileName: singleFile.name
              }
              dataURLtoFile(imageData);
              function dataURLtoFile(imageData){
                let arr = imageData.base64.split(','), 
                    mime = arr[0].match(/:(.*?);/)[1],
                    bstr = atob(arr[1]), n = bstr.length, 
                    u8arr = new Uint8Array(n);
                    while(n--){
                        u8arr[n] = bstr.charCodeAt(n);
                    }
                    var newFile = new File([u8arr], imageData.fileName, {type:mime});
                    newFile.tempImg = imageData.base64;
                    resolve(newFile);
              }
            }
            else {
              resolve(singleFile);
            }
          };
        });
        return info;
      }
      let tempFile = await compressImage(singleFile);
      singleFile = tempFile;  

      // 檢查圖片寬高
      const maxFileWidth = 6000;
      const maxFileHeight = 4000;
      async function checkFileWidthHeight(singleFile) {
        let src = await getPreviewSrc(singleFile);
        let info = await new Promise((resolve) => {
          let image = new Image();
          image.src = src;
          image.onload = function() {
            const fileWidth = image.width;
            const fileHeight = image.height;
            const isValidWidthHeight = (fileWidth <= maxFileWidth && fileHeight <= maxFileHeight);
            let hint = (!isValidWidthHeight) ? "圖片長寬需在 6000 x 4000 內" : ""
            resolve({hint,fileWidth,fileHeight});
          };
        });
        if(info.hint) {
          message.push(info.hint);
        }
        else {
          singleFile.width = info.fileWidth;
          singleFile.height = info.fileHeight;
        }
      }

      // 當檔案格式正確時，再來檢查圖片寬高
      if (isValidType) {
        await checkFileWidthHeight(singleFile);
      }
      
      if(message.length != 0) {
        // 存錯誤訊息
        message.forEach(item => {
          errorMessageSet.value.push(item);
        })
        console.log(errorMessageSet.value);
      }
      else if (errorMessageSet.value.length != 0) {
        // 當有錯誤訊息時，淨空 cropFiles 剪裁陣列
        cropFiles.value.splice(0, cropFiles.value.length);
      }
      else {
        // 將檔案存進 cropFiles 剪裁陣列
        await previewImage(singleFile);
        singleFile.autoCrop = true;
        singleFile.fixed = true;
        singleFile.centerBox = true;
        cropFiles.value.push(singleFile);
      }

      return message;
    }

    // Bootstrap Modal
    const cropModalRef = Vue.ref();
    let cropModal = '';
    Vue.onMounted(() => {
      cropModal = new bootstrap.Modal(cropModalRef.value, {
        keyboard: false,
        backdrop: 'static'
      });
    })

    // 當 cropFiles 剪裁陣列裡面沒有東西時，Bootstrap Modal 隱藏
    Vue.watch(cropFiles.value,() => {
      if(cropFiles.value.length == 0) {
        cropModal.hide();
      }
    })

    // 此變數用來處理 vue-cropper 套件內建方法和屬性使用 this.$refs.cropper 調用，但 Vue3 setup() 中沒有 this.$refs 的問題
    const cropper = Vue.ref();

    // 圖片裁切
    async function cropImage(name) {
      let cropImg = await new Promise((resolve) => {
        cropper.value.getCropData(data => {
          resolve(data);
        })
      });
      cropper.value.getCropBlob(data => {
        let newFile = new File([data], name, {
          type: cropFiles.value[0].type,
        })
        newFile.width = cropper.value.cropW;
        newFile.height = cropper.value.cropH;
        newFile.tempImg = cropImg;
        cropFiles.value.shift();
        filesSet.value.push(newFile);
      })
    }

    // vue-cropper 元件在 Bootstrap Modal 中載入第一張圖片時，長寬會錯誤顯示成 100 x 100，所以用 vue-cropper 的 refresh 方法重新載入
    function realTime(data) {
      if(data.w == 100) {
        cropper.value.refresh();
      }
    }

    // 取得預覽圖片的 Base64 網址
    function getPreviewSrc(singleFile) {
      return new Promise((resolve) => {
        const reader = new FileReader(); // HTML5 原生取得檔案資訊的物件
        reader.readAsDataURL(singleFile);
        reader.addEventListener("load", function() {
          resolve(reader.result);
        });
      })
    }

    // 錯誤訊息視窗
    function errorMessage(message) {
      // 過濾掉重複的訊息
      let result = message.filter((element, index, arr) => {
        return arr.indexOf(element) === index;
      })
      Swal.fire({
        title: result.join('\n'),
        icon: 'error',
        confirmButtonText: '關閉'
      })
    }
    
    // 預覽圖片
    async function previewImage(singleFile) {
      let src = await getPreviewSrc(singleFile);
      singleFile.tempImg = src;
    }

    // 壓縮檔案
    async function zipFile() {
      var zip = new JSZip();
      Object.keys(filesSet.value).forEach(item => {
        let url = filesSet.value[item].tempImg.split(',');
        zip.file(filesSet.value[item].name, url[1],{base64: true});
      })
      return zip.generateAsync({
        type:"blob",
        compression: "DEFLATE", // 壓縮
        compressionOptions: {
          level: 9 
        }  
      });
    }
    
    async function uploadFile() {
      if(filesSet.value.length == 0) {
        Swal.fire({
          title: '請先選擇檔案',
          icon: 'error',
          confirmButtonText: '關閉'
        })
      }
      else {
        // await uploadToFirebase();
        await uploadToImgur(filesSet.value.length);
        filesSet.value = [];
        progressModal.show();  
      }
    }

    // Firebase 檔案上傳
    async function uploadToFirebase() {

      let compressFile = await zipFile();

      const bytesPerPiece = 1024 * 30; // 每個檔案切片大小為 30KB.
      const totalPieces = Math.ceil(compressFile.size / bytesPerPiece);
      let chunks = [];
      let start = 0;
      let end = 0;
      let hash = Date.now().toString();

      for(let i = 0; i < totalPieces; i++) {
        end = end + bytesPerPiece;
        chunks[i] = compressFile.slice(start,end);
        start = end;
      }


      chunks.forEach((item,index) => {

        // 設定上傳至 storage 後的檔案路徑
        const path = `${md5(item)}${hash}_${index + 1}.zip`; 

        // 取得 storage 對應的位置
        const storageRef = ref(storage, path);

        // 把東西丟到該位置裡
        uploadBytes(storageRef, item).then((snapshot) => {
          // console.log(snapshot);
        });

      })
    }

    let progress = Vue.ref(0);
    let singleComplete = [];
    let completeSet = [];

    // Imgur 圖片上傳
    async function uploadToImgur(length) {
      const token = '10d757313f5bf4303d590a1e69ac1d666071137c'; // 一個月後過期
      const album = 'D8x3xCY';

      let settings = {
        async: true,
        crossDomain: true,
        processData: false,
        contentType: false,
        method: 'POST',
        url: 'https://api.imgur.com/3/image',
        headers: {
          Authorization: 'Bearer ' + token
        },
        mimeType: 'multipart/form-data',
        onUploadProgress: progressEvent => {
          singleComplete = (progressEvent.loaded / progressEvent.total) * 100 / length;
        }
      };

      progress.value = 0;
      completeSet = [];
      
      // 一次上傳多個圖檔
      Object.keys(filesSet.value).forEach(item => {
        let form = new FormData();
        form.append('image', filesSet.value[item].tempImg.split(',')[1]);
        form.append('title', filesSet.value[item].name);
        form.append('description', filesSet.value[item].type);
        form.append('album', album); // 有要指定的相簿就加這行

        settings.data = form;

        axios(settings).then(response => {
          if(response.status == 200) {
            progress.value = 0;
            completeSet[item] = Number(singleComplete.toFixed(2));
            completeSet.forEach(element => {
              progress.value += element; 
            }) 
            showPreview.value = false;
            showPrimaryUpload.value = true;
            showSecondaryUpload.value = false;  
          }
          else {
            Swal.fire({
              title: '上傳失敗',
              icon: 'error',
              confirmButtonText: '關閉'
            })
          }
        })
      })
    }

    // Bootstrap Modal
    const progressModalRef = Vue.ref();
    let progressModal = '';
    Vue.onMounted(() => {
      progressModal = new bootstrap.Modal(progressModalRef.value, {
        keyboard: false,
        backdrop: 'static'
      });
    })

    // 監測上傳進度條是否到 100%
    Vue.watch(progress,() => {
      if(progress.value == 100) {
        setTimeout(() => { 
          progressModal.hide(); 
        }, 1000);
        setTimeout(() => { 
          Swal.fire({
            title: '上傳成功',
            icon: 'success',
            confirmButtonText: '關閉'
          })
        }, 1500);
        getFromFirebase();
        getFromImgur();
      }
    })

    // 從 Firebase 上取得檔案資訊
    let firebase = Vue.ref([]);
    function getFromFirebase() {
      firebase.value.splice(0, firebase.value.length);
      // Create a reference under which you want to list
      const listRef = ref(storage, '');

      // Find all the prefixes and items.
      listAll(listRef)
        .then((res) => {
          res.items.forEach((itemRef) => {
            firebase.value.push(itemRef);
          });
        }).catch((error) => {
          console.log(error);
        });
    }
    getFromFirebase();

    // 從 Imgur 上取得檔案資訊
    let imgur = Vue.ref([]);
    function getFromImgur() {
      const token = '10d757313f5bf4303d590a1e69ac1d666071137c'; // 一個月後過期
      const album = 'D8x3xCY';

      let settings = {
        async: true,
        crossDomain: true,
        method: 'GET',
        url: 'https://api.imgur.com/3/album/' + album + '/images',
        headers: {
          Authorization: 'Bearer ' + token
        },
      };
      
      axios(settings).then(response => {
        imgur.value = response.data.data;
      })
    }
    getFromImgur();

    return {
      files,
      filesSet,
      cropFiles,
      showPreview,
      showPrimaryUpload,
      showSecondaryUpload,
      cropper,
      cropModalRef,
      progressModalRef,
      progress,
      firebase,
      imgur,
      preventDefault,
      loadFile,
      cropImage,
      realTime,
      uploadFile,
      uploadToFirebase,
      uploadToImgur
    };
  },
};
// Vue.createApp(App).mount("#app");
const app = Vue.createApp(App);
app.component('vue-cropper', window['vue-cropper'].VueCropper);
app.mount('#app');