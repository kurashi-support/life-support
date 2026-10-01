(function(){
  "use strict";

  function load(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    }catch(e){ return fallback; }
  }
  function save(key, val){
    try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){}
  }

  /* ---------- Today's date ---------- */
  const weekdays = ["日","月","火","水","木","金","土"];
  const now = new Date();
  document.getElementById("todayDate").textContent =
    now.getFullYear() + "年" + (now.getMonth()+1) + "月" + now.getDate() + "日（" + weekdays[now.getDay()] + "）";

  /* ---------- Money ---------- */
  let money = load("ls_money", 1250);
  const moneyDisplay = document.getElementById("moneyDisplay");
  const moneyInput = document.getElementById("moneyInput");
  const moneyBtn = document.getElementById("moneyBtn");

  function renderMoney(){
    moneyDisplay.innerHTML = Number(money).toLocaleString("ja-JP") + "<span class=\"unit\">円</span>";
  }
  renderMoney();

  moneyBtn.addEventListener("click", function(){
    const editing = !moneyInput.classList.contains("hidden");
    if(!editing){
      moneyInput.value = money;
      moneyDisplay.classList.add("hidden");
      moneyInput.classList.remove("hidden");
      moneyBtn.textContent = "保存する";
      moneyInput.focus();
      moneyInput.select();
    }else{
      const val = parseInt(moneyInput.value, 10);
      money = isNaN(val) ? money : val;
      save("ls_money", money);
      renderMoney();
      moneyDisplay.classList.remove("hidden");
      moneyInput.classList.add("hidden");
      moneyBtn.textContent = "編集する";
    }
  });
  moneyInput.addEventListener("keydown", function(e){
    if(e.key === "Enter"){ e.preventDefault(); moneyBtn.click(); }
  });

  /* ---------- Todo ---------- */
  let todos = load("ls_todos", [
    {text:"課題をやる", done:false},
    {text:"洗濯する", done:false},
    {text:"ゴミを出す", done:false}
  ]);
  const todoList = document.getElementById("todoList");
  const todoProgress = document.getElementById("todoProgress");
  const todoForm = document.getElementById("todoForm");
  const todoInput = document.getElementById("todoInput");

  function renderTodos(){
    todoList.innerHTML = "";
    todos.forEach(function(item, i){
      const li = document.createElement("li");

      const check = document.createElement("button");
      check.type = "button";
      check.className = "todo-check";
      check.setAttribute("aria-pressed", item.done ? "true" : "false");
      check.setAttribute("aria-label", (item.done ? "完了を取り消す: " : "完了にする: ") + item.text);
      check.textContent = item.done ? "✓" : "";
      check.addEventListener("click", function(){
        todos[i].done = !todos[i].done;
        save("ls_todos", todos);
        renderTodos();
      });

      const text = document.createElement("span");
      text.className = "todo-text" + (item.done ? " done" : "");
      text.textContent = item.text;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "todo-remove";
      remove.setAttribute("aria-label", item.text + "を削除");
      remove.textContent = "×";
      remove.addEventListener("click", function(){
        todos.splice(i,1);
        save("ls_todos", todos);
        renderTodos();
      });

      li.appendChild(check);
      li.appendChild(text);
      li.appendChild(remove);
      todoList.appendChild(li);
    });
    const done = todos.filter(function(t){return t.done;}).length;
    todoProgress.textContent = todos.length ? (done + "/" + todos.length + " 完了") : "";
  }
  renderTodos();

  todoForm.addEventListener("submit", function(e){
    e.preventDefault();
    const val = todoInput.value.trim();
    if(!val) return;
    todos.push({text:val, done:false});
    save("ls_todos", todos);
    todoInput.value = "";
    renderTodos();
  });

  /* ---------- Meal ---------- */
  let meal = load("ls_meal", null);
  const mealStatus = document.getElementById("mealStatus");
  const mealBtn = document.getElementById("mealBtn");
  const mealEdit = document.getElementById("mealEdit");
  const mealInput = document.getElementById("mealInput");
  const mealSave = document.getElementById("mealSave");

  function renderMeal(){
    if(meal){
      mealStatus.textContent = "今夜は「" + meal + "」に決定！";
      mealStatus.classList.add("decided");
      mealBtn.textContent = "変更する";
    }else{
      mealStatus.textContent = "まだ決まっていません";
      mealStatus.classList.remove("decided");
      mealBtn.textContent = "夜ご飯を決める";
    }
  }
  renderMeal();

  mealBtn.addEventListener("click", function(){
    mealInput.value = meal || "";
    mealEdit.classList.remove("hidden");
    mealInput.focus();
  });
  mealSave.addEventListener("click", function(){
    const val = mealInput.value.trim();
    meal = val || meal;
    save("ls_meal", meal);
    mealEdit.classList.add("hidden");
    renderMeal();
  });
  mealInput.addEventListener("keydown", function(e){
    if(e.key === "Enter"){ e.preventDefault(); mealSave.click(); }
  });

  /* ---------- Schedule ---------- */
  let schedule = load("ls_schedule", [
    {time:"18:00", text:"バイト"},
    {time:"21:00", text:"帰宅"}
  ]);
  const timeline = document.getElementById("timeline");
  const schedForm = document.getElementById("schedForm");
  const schedTime = document.getElementById("schedTime");
  const schedText = document.getElementById("schedText");

  function renderSchedule(){
    timeline.innerHTML = "";
    if(!schedule.length){
      const li = document.createElement("li");
      li.innerHTML = '<p class="empty-note">予定はまだありません</p>';
      timeline.appendChild(li);
      return;
    }
    schedule
      .slice()
      .sort(function(a,b){ return a.time.localeCompare(b.time); })
      .forEach(function(item){
        const li = document.createElement("li");
        const time = document.createElement("span");
        time.className = "timeline-time";
        time.textContent = item.time;
        const text = document.createElement("span");
        text.className = "timeline-text";
        text.textContent = item.text;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "timeline-remove";
        remove.setAttribute("aria-label", item.text + "を削除");
        remove.textContent = "×";
        remove.addEventListener("click", function(){
          schedule = schedule.filter(function(s){ return !(s.time === item.time && s.text === item.text); });
          save("ls_schedule", schedule);
          renderSchedule();
        });
        li.appendChild(time);
        li.appendChild(text);
        li.appendChild(remove);
        timeline.appendChild(li);
      });
  }
  renderSchedule();

  schedForm.addEventListener("submit", function(e){
    e.preventDefault();
    if(!schedTime.value || !schedText.value.trim()) return;
    schedule.push({time:schedTime.value, text:schedText.value.trim()});
    save("ls_schedule", schedule);
    schedTime.value = "";
    schedText.value = "";
    renderSchedule();
  });

  /* ---------- Fridge ---------- */
  let fridge = load("ls_fridge", []);
  const fridgeList = document.getElementById("fridgeList");
  const fridgeForm = document.getElementById("fridgeForm");
  const fridgeInput = document.getElementById("fridgeInput");

  function renderFridge(){
    fridgeList.innerHTML = "";
    if(!fridge.length){
      const li = document.createElement("li");
      li.style.background = "transparent";
      li.style.padding = "0";
      li.innerHTML = '<span class="empty-note">まだ何も登録されていません</span>';
      fridgeList.appendChild(li);
      return;
    }
    fridge.forEach(function(item, i){
      const li = document.createElement("li");
      const text = document.createElement("span");
      text.textContent = item;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "tag-remove";
      remove.setAttribute("aria-label", item + "を削除");
      remove.textContent = "×";
      remove.addEventListener("click", function(){
        fridge.splice(i,1);
        save("ls_fridge", fridge);
        renderFridge();
      });
      li.appendChild(text);
      li.appendChild(remove);
      fridgeList.appendChild(li);
    });
  }
  renderFridge();

  fridgeForm.addEventListener("submit", function(e){
    e.preventDefault();
    const val = fridgeInput.value.trim();
    if(!val) return;
    fridge.push(val);
    save("ls_fridge", fridge);
    fridgeInput.value = "";
    renderFridge();
  });

  /* ---------- Memo ---------- */
  const memoArea = document.getElementById("memoArea");
  memoArea.value = load("ls_memo", "");
  memoArea.addEventListener("input", function(){
    save("ls_memo", memoArea.value);
  });

})();
