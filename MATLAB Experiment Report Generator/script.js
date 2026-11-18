(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ============================================================
     1. MATLAB 简易语法高亮
     ============================================================ */
  var MATLAB_KEYWORDS = new Set((
    'break case catch classdef continue else elseif end for function global ' +
    'if methods otherwise parfor persistent properties events enumeration ' +
    'arguments return spmd switch try while'
  ).split(/\s+/));

  var MATLAB_FUNCS = new Set((
    'abs all any arrayfun axis bar cell cellfun char clc clear close colorbar ' +
    'cos disp display double error exp eye fclose feof fgetl fgets figure find ' +
    'fit fill filter flip fliplr flipud floor fopen fprintf fplot fread frewind ' +
    'fscanf fwrite grid help hist hold ifft imag input int32 int64 integral ' +
    'interp1 inv isempty isnan isnumeric length legend linspace load log log10 ' +
    'logical lower max mean median mesh meshgrid min mod nan num2str numel ones ' +
    'plot plot3 polar polyfit polyval print prod pwd rand randn real regexp rem ' +
    'repmat reshape round save scatter sec set show size sort sprintf sqrt std ' +
    'strcat strcmp strcmpi strfind string strsplit strtrim subplot sum surf tan ' +
    'text title trace transpose trapz unique upper var xlabel xlim ylabel ylim zeros'
  ).split(/\s+/));

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* 判断单引号是否是「转置符」而不是「字符串起始」 */
  function isTransposeCtx(ch) {
    return /[A-Za-z0-9_)\]}.]/.test(ch);
  }

  function highlightMatlab(src) {
    var out = '', i = 0, n = src.length, c, j, prev = '';
    while (i < n) {
      c = src[i];
      /* ---- 注释：% 行注释 / %{ ... %} 块注释 ---- */
      if (c === '%') {
        if (src[i + 1] === '{' && (i === 0 || src[i - 1] === '\n')) {// 块注释
          j = src.indexOf('%}', i + 2);
          j = (j === -1) ? n : j + 2;
        } else {// 行注释
          j = src.indexOf('\n', i);
          if (j === -1) j = n;
        }
        out += '<span class="tok-cmt">' + escapeHtml(src.slice(i, j)) + '</span>';
        i = j;
        prev = '';
        continue;
      }

      /* ---- 字符串：'...' 或 "..." ---- */
      if (c === '"' || (c === "'" && !isTransposeCtx(prev))) {
        var q = c;
        j = i + 1;
        while (j < n) {
          if (src[j] === q) {
            if (q === "'" && src[j + 1] === "'") {
                 j += 2; 
                 continue; 
                }  // '' 转义
            j++;
            break;
          }
          if (src[j] === '\n') break;
          j++;
        }
        out += '<span class="tok-str">' + escapeHtml(src.slice(i, j)) + '</span>';
        i = j;
        prev = '';
        continue;
      }

      /* ---- 标识符 / 关键字 / 内置函数 ---- */
      if (/[A-Za-z_]/.test(c)) {
        j = i + 1;
        while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
        var w = src.slice(i, j);
        if (MATLAB_KEYWORDS.has(w)) {
          out += '<span class="tok-kw">' + w + '</span>';
        } else if (MATLAB_FUNCS.has(w)) {
          out += '<span class="tok-fn">' + w + '</span>';
        } else {
          out += escapeHtml(w);
        }
        prev = w.charAt(w.length - 1);
        i = j;
        continue;
      }

      /* ---- 数字 ---- */
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        j = i + 1;
        while (j < n && /[0-9a-zA-Z_.]/.test(src[j])) j++;
        out += '<span class="tok-num">' + escapeHtml(src.slice(i, j)) + '</span>';
        prev = src.charAt(j - 1);
        i = j;
        continue;
      }

      /* ---- 其它字符 ---- */
      out += escapeHtml(c);
      if (!/\s/.test(c)) prev = c;
      i++;
    }
    return out;
  }

  /* ============================================================
     2. 状态提示
     ============================================================ */
  var statusTimer;
  function setStatus(msg) {
    var el = $('status');
    el.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { el.textContent = ''; }, 4000);
  }

  /* ============================================================
     3. 图片压缩
     ============================================================ */
  function compressImage(file, maxW, quality) {
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          try {
            resolve(cv.toDataURL('image/jpeg', quality));
          } catch (e) { resolve(null); }
        };
        img.onerror = function () { resolve(null); };
        img.src = reader.result;
      };
      reader.onerror = function () { resolve(null); };
      reader.readAsDataURL(file);
    });
  }

  /* ============================================================
     4. 图片组管理器（目的 / 结果各一个实例）
     ============================================================ */
  function createImageGroup(cfg) {
    var images = [];
    function renderThumbs() {
      var box = $(cfg.thumbListId);
      if (!box) return;
      box.innerHTML = '';
      images.forEach(function (im, idx) {
        var d = document.createElement('div');
        d.className = 'thumb';

        var img = document.createElement('img');
        img.src = im.dataUrl;
        img.alt = im.name || ('图片 ' + (idx + 1));

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'thumb-del';
        btn.textContent = '×';
        btn.title = '删除这张图片';
        btn.addEventListener('click', function () {
          images.splice(idx, 1);
          renderThumbs();
          saveDraft();
          setStatus('已删除图片');
        });

        d.appendChild(img);
        d.appendChild(btn);
        box.appendChild(d);
      });
      box.style.display = images.length ? 'flex' : 'none';
    }

    async function handleFiles(fileList) {
      var files = Array.prototype.slice.call(fileList || []);
      if (!files.length) return;
      setStatus('正在处理图片…');
      for (var k = 0; k < files.length; k++) {
        var f = files[k];
        if (!/^image\//.test(f.type)) continue;
        var data = await compressImage(f, 1400, 0.82);
        if (data) images.push({ dataUrl: data, name: f.name });
      }
      renderThumbs();
      saveDraft();
      setStatus(cfg.label + '图片已添加（共 ' + images.length + ' 张）');
    }

    var fi = $(cfg.fileInputId);
    if (fi) {
      fi.addEventListener('change', function () {
        handleFiles(fi.files);
        fi.value = '';   // 允许重复选择同一文件
      });
    }

    return {
      getImages: function () { return images; },
      setImages: function (arr) {
        images = Array.isArray(arr) ? arr.filter(function (im) {
          return im && typeof im.dataUrl === 'string';
        }) : [];
        renderThumbs();
      },
      clear: function () { images = []; renderThumbs(); }
    };
  }

  var purposeGroup, resultGroup;

  /* ============================================================
     5. 生成报告
     ============================================================ */
  function normalizeCode(s) {
    return s
      .replace(/^\uFEFF/, '')        // 去掉 BOM
      .replace(/\r\n?/g, '\n')       // 统一换行符
      .replace(/\t/g, '    ')        // Tab -> 4 空格
      .replace(/[ \t]+$/gm, '')      // 去掉行尾空白
      .replace(/\s+$/, '');          // 去掉结尾空白
  }

  function fillText(el, val) {
    if (!el) return false;
    var v = (val || '').trim();
    el.textContent = v;
    var sec = el.closest('.section');
    if (sec) sec.style.display = v ? '' : 'none';
    return !!v;
  }

  function renderImagesTo(container, imgs) {
    if (!container) return;
    container.innerHTML = '';
    imgs.forEach(function (im, idx) {
      var fig = document.createElement('div');
      fig.className = 'img-item';

      var img = document.createElement('img');
      img.src = im.dataUrl;
      img.alt = im.name || ('图 ' + (idx + 1));

      fig.appendChild(img);
      container.appendChild(fig);
    });
  }

  function generate(scrollToReport) {
    /* ---------- 代码 ---------- */
    var code = normalizeCode($('iCode').value);

    /* ---------- 头部信息 ---------- */
    $('mCourse').textContent  = $('iCourse').value.trim();
    $('mName').textContent    = $('iName').value.trim();
    $('mStudent').textContent = $('iStudent').value.trim();
    $('mId').textContent      = $('iId').value.trim();
    $('mClass').textContent   = $('iClass').value.trim();
    $('mDate').textContent    = $('iDate').value.trim();

    $('rTitle').textContent = '实验报告';
    $('rSub').textContent   = $('iName').value.trim();

    /* ---------- 一、实验目的（文字 + 图片，任一存在即显示） ---------- */
    var purposeText = $('iPurpose').value.trim();
    var purposeImgs = purposeGroup.getImages();
    $('bPurpose').textContent = purposeText;
    renderImagesTo($('bPurposeImages'), purposeImgs);
    $('secPurpose').style.display = (purposeText || purposeImgs.length) ? '' : 'none';

    /* ---------- 二、实验原理 / 三、实验环境 / 六、实验总结 ---------- */
    fillText($('bPrinciple'), $('iPrinciple').value);
    fillText($('bEnv'),       $('iEnv').value);
    fillText($('bSummary'),   $('iSummary').value);

    /* ---------- 四、程序代码 ---------- */
    var codeOut = $('bCode');
    if (code) {
      codeOut.innerHTML = $('iHighlight').checked
        ? highlightMatlab(code)
        : escapeHtml(code);
      $('secCode').style.display = '';
    } else {
      $('secCode').style.display = 'none';
    }

    /* ---------- 五、运行结果（文字 + 图片） ---------- */
    var resultText = $('iResult').value.trim();
    var resultImgs = resultGroup.getImages();
    $('bResult').textContent = resultText;
    renderImagesTo($('bResultImages'), resultImgs);
    $('secResult').style.display = (resultText || resultImgs.length) ? '' : 'none';

    /* ---------- 浏览器标题 → 影响 PDF 默认文件名 ---------- */
    var name = $('iName').value.trim();
    document.title = name ? (name + '_实验报告') : '实验报告';

    $('report').classList.add('show');
    setStatus('报告已生成，可以打印了');

    if (scrollToReport !== false) {
      $('report').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /* ============================================================
     6. 草稿自动保存
     ============================================================ */
  var FIELD_IDS = [
    'iCourse', 'iName', 'iStudent', 'iId', 'iClass', 'iDate',
    'iPurpose', 'iPrinciple', 'iEnv', 'iCode', 'iResult', 'iSummary'
  ];
  var STORAGE_KEY = 'exp-report-draft-matlab-v2';

  function saveDraft() {
    if (!$('iAutoSave').checked) return;
    var data = {
      fields: {},
      purposeImages: purposeGroup.getImages(),
      resultImages: resultGroup.getImages()
    };
    FIELD_IDS.forEach(function (id) { data.fields[id] = $(id).value; });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // 图片过多导致超出存储配额：降级为只保存文字
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          fields: data.fields,
          purposeImages: [],
          resultImages: []
        }));
        setStatus('草稿过大，本次仅保存文字（图片未保存）');
      } catch (e2) { /* 放弃保存 */ }
    }
  }

  var saveTimer;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 400);
  }

  function loadDraft() {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) {}
    if (!data) return;

    if (data.fields) {
      FIELD_IDS.forEach(function (id) {
        if (typeof data.fields[id] === 'string') $(id).value = data.fields[id];
      });
    }

    if (Array.isArray(data.purposeImages)) {
      purposeGroup.setImages(data.purposeImages);
    }

    // 兼容旧版草稿：images 视为运行结果图片
    var resultImgs = Array.isArray(data.resultImages) ? data.resultImages
                   : (Array.isArray(data.images) ? data.images : []);
    resultGroup.setImages(resultImgs);
  }

  /* ============================================================
     7. 初始化
     ============================================================ */
  function init() {
    purposeGroup = createImageGroup({
      fileInputId: 'iPurposeImages',
      thumbListId: 'thumbListPurpose',
      label: '目的'
    });
    resultGroup = createImageGroup({
      fileInputId: 'iResultImages',
      thumbListId: 'thumbListResult',
      label: '结果'
    });

    loadDraft();

    // 默认日期
    if (!$('iDate').value.trim()) {
      var d = new Date();
      $('iDate').value = d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    }

    FIELD_IDS.forEach(function (id) {
      $(id).addEventListener('input', scheduleSave);
    });
    $('iHighlight').addEventListener('change', scheduleSave);

    // 生成 / 打印
    $('btnGenerate').addEventListener('click', function () { generate(true); });

    $('btnPrint').addEventListener('click', function () {
      if (!$('report').classList.contains('show')) generate(false);
      setTimeout(function () { window.print(); }, 60);
    });

    // 清空
    $('btnClear').addEventListener('click', function () {
      if (!confirm('确定要清空全部内容（含已添加的图片）吗？此操作不可撤销。')) return;
      FIELD_IDS.forEach(function (id) { $(id).value = ''; });
      purposeGroup.clear();
      resultGroup.clear();
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      $('report').classList.remove('show');
      setStatus('已清空');
    });

    // 保险：直接 Ctrl+P 时也先自动生成
    window.addEventListener('beforeprint', function () {
      if (!$('report').classList.contains('show')) generate(false);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();