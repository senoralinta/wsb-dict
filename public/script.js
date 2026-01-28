// script.js - frontend logic (calls server /api/ endpoints)
// Assumes it's served from the same origin as the API (use credentials: 'include')
let currentUser = null;

async function apiFetch(path, opts = {}) {
  const res = await fetch('/api' + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && json && json.error) throw new Error(json.error);
  return json;
}

// UI bindings
document.addEventListener('DOMContentLoaded', () => {
  // auth UI
  const showLoginBtn = document.getElementById('showLoginBtn');
  const showRegisterBtn = document.getElementById('showRegisterBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const userInfo = document.getElementById('userInfo');

  const loginPanel = document.getElementById('loginPanel');
  const registerPanel = document.getElementById('registerPanel');

  showLoginBtn.onclick = () => loginPanel.style.display = 'block';
  showRegisterBtn.onclick = () => registerPanel.style.display = 'block';
  document.getElementById('closeLogin').onclick = () => loginPanel.style.display = 'none';
  document.getElementById('closeRegister').onclick = () => registerPanel.style.display = 'none';

  document.getElementById('loginBtn').onclick = async () => {
    const u = document.getElementById('loginUser').value.trim();
    const p = document.getElementById('loginPass').value;
    try {
      const { user } = await apiFetch('/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
      onLogin(user);
      loginPanel.style.display = 'none';
      await loadTopics();
    } catch (e) { alert('Login failed: ' + e.message); }
  };

  document.getElementById('registerBtn').onclick = async () => {
    const u = document.getElementById('regUser').value.trim();
    const p = document.getElementById('regPass').value;
    try {
      const { user } = await apiFetch('/register', { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
      onLogin(user);
      registerPanel.style.display = 'none';
      await loadTopics();
    } catch (e) { alert('Register failed: ' + e.message); }
  };

  logoutBtn.onclick = async () => {
    await apiFetch('/logout', { method: 'POST' });
    onLogout();
    await loadTopics();
  };

  // create topic
  document.getElementById('createTopicBtn').onclick = async () => {
    const title = document.getElementById('newTitle').value.trim();
    const tags = document.getElementById('newTags').value.split(',').map(s => s.trim()).filter(Boolean);
    if (!title) return alert('Title required');
    try {
      await apiFetch('/topics', { method: 'POST', body: JSON.stringify({ title, tags }) });
      document.getElementById('newTitle').value = '';
      document.getElementById('newTags').value = '';
      await loadTopics();
    } catch (e) {
      alert('Create topic failed: ' + e.message);
    }
  };

  // search
  document.getElementById('searchBtn').onclick = async () => {
    const q = document.getElementById('searchInput').value.trim();
    const res = await apiFetch('/search?q=' + encodeURIComponent(q));
    renderSearchResults(res);
  };

  // topic view controls
  document.getElementById('backBtn').onclick = () => {
    document.getElementById('topicView').style.display = 'none';
    document.getElementById('createTopic').style.display = 'block';
  };
  document.getElementById('createPostBtn').onclick = async () => {
    const content = document.getElementById('newPostContent').value.trim();
    const topicId = document.getElementById('topicView').dataset.topicId;
    if (!content) return alert('Content required');
    try {
      await apiFetch(`/topics/${topicId}/posts`, { method: 'POST', body: JSON.stringify({ content }) });
      document.getElementById('newPostContent').value = '';
      await loadTopic(topicId);
    } catch (e) { alert('Post failed: ' + e.message); }
  };

  // initial restore session and load topics
  restoreSessionAndLoad();
  
  // helper functions
  async function restoreSessionAndLoad() {
    try {
      const res = await apiFetch('/me');
      if (res.user) {
        currentUser = res.user;
        onLogin(currentUser);
      } else {
        onLogout();
      }
    } catch (e) {
      onLogout();
    }
    await loadTopics();
  }

  function onLogin(user) {
    currentUser = user;
    userInfo.textContent = `Logged in as ${user.username}` + (user.is_moderator ? ' (moderator)' : '');
    showLoginBtn.style.display = 'none';
    showRegisterBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-block';
  }
  function onLogout() {
    currentUser = null;
    userInfo.textContent = 'Not logged in';
    showLoginBtn.style.display = 'inline-block';
    showRegisterBtn.style.display = 'inline-block';
    logoutBtn.style.display = 'none';
  }

  // load topics
  async function loadTopics() {
    const res = await apiFetch('/topics');
    const list = document.getElementById('topicsList');
    list.innerHTML = '';
    for (const t of res.topics) {
      const el = document.createElement('div');
      el.className = 'topicRow';
      const title = document.createElement('a');
      title.href = '#';
      title.textContent = t.title;
      title.onclick = (e) => { e.preventDefault(); showTopic(t.id); };
      el.appendChild(title);

      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = ` — ${t.author || 'anon'} — ${new Date(t.created_at).toLocaleString()}`;
      el.appendChild(meta);

      if (t.tags && t.tags.length) {
        const tags = document.createElement('div');
        tags.className = 'tags';
        tags.textContent = t.tags.map(x => `#${x}`).join(' ');
        el.appendChild(tags);
      }
      list.appendChild(el);
    }
  }

  async function showTopic(id) {
    await loadTopic(id);
    document.getElementById('createTopic').style.display = 'none';
    document.getElementById('topicView').style.display = 'block';
  }

  async function loadTopic(id) {
    const res = await apiFetch(`/topics/${id}`);
    const topic = res.topic;
    const title = document.getElementById('topicTitle');
    title.textContent = topic.title;
    document.getElementById('topicView').dataset.topicId = topic.id;
    const tags = document.getElementById('topicTags');
    tags.textContent = (topic.tags || []).map(x => `#${x}`).join(' ');
    const postsList = document.getElementById('postsList');
    postsList.innerHTML = '';
    for (const p of topic.posts) {
      const pdiv = document.createElement('div');
      pdiv.className = 'post';
      if (p.is_hidden) {
        pdiv.innerHTML = `<em>(hidden by moderator)</em>`;
      } else {
        pdiv.innerHTML = `<div class="postMeta">${p.username || 'anon'} — ${new Date(p.created_at).toLocaleString()}</div>
                          <div class="postContent">${escapeHtml(p.content)}</div>`;
        const controls = document.createElement('div');
        controls.className = 'postControls';

        const score = document.createElement('span');
        score.textContent = `Score: ${p.score || 0}`;
        score.id = `score-${p.id}`;
        controls.appendChild(score);

        const up = document.createElement('button');
        up.textContent = '▲';
        up.className = 'smallbtn';
        up.onclick = async () => {
          try {
            const r = await apiFetch(`/posts/${p.id}/vote`, { method: 'POST', body: JSON.stringify({ value: 1 }) });
            document.getElementById(`score-${p.id}`).textContent = `Score: ${r.score}`;
          } catch (e) { alert('Vote failed: ' + e.message); }
        };
        controls.appendChild(up);

        const down = document.createElement('button');
        down.textContent = '▼';
        down.className = 'smallbtn';
        down.onclick = async () => {
          try {
            const r = await apiFetch(`/posts/${p.id}/vote`, { method: 'POST', body: JSON.stringify({ value: -1 }) });
            document.getElementById(`score-${p.id}`).textContent = `Score: ${r.score}`;
          } catch (e) { alert('Vote failed: ' + e.message); }
        };
        controls.appendChild(down);

        const report = document.createElement('button');
        report.textContent = 'Report';
        report.className = 'smallbtn';
        report.onclick = async () => {
          try {
            await apiFetch(`/posts/${p.id}/report`, { method: 'POST' });
            alert('Reported');
          } catch (e) { alert('Report failed: ' + e.message); }
        };
        controls.appendChild(report);

        const hide = document.createElement('button');
        hide.textContent = 'Hide (mod)';
        hide.className = 'smallbtn';
        hide.onclick = async () => {
          try {
            await apiFetch(`/posts/${p.id}/hide`, { method: 'POST' });
            await loadTopic(id);
          } catch (e) { alert('Hide failed: ' + e.message); }
        };
        controls.appendChild(hide);

        pdiv.appendChild(controls);
      }
      postsList.appendChild(pdiv);
    }
  }

  function renderSearchResults(res) {
    const list = document.getElementById('topicsList');
    list.innerHTML = '<h3>Search results</h3>';
    if ((res.topics && res.topics.length) === 0 && (res.posts && res.posts.length) === 0) {
      list.innerHTML += '<div>No results</div>';
      return;
    }
    if (res.topics && res.topics.length) {
      for (const t of res.topics) {
        const el = document.createElement('div');
        el.innerHTML = `<a href="#">${t.title}</a>`;
        el.querySelector('a').onclick = (e) => { e.preventDefault(); showTopic(t.id); };
        list.appendChild(el);
      }
    }
    if (res.posts && res.posts.length) {
      list.innerHTML += '<h4>Matching posts</h4>';
      for (const p of res.posts) {
        const el = document.createElement('div');
        el.innerHTML = `<div>${escapeHtml(p.content.slice(0, 200))}...</div><small>topic id: ${p.topic_id}</small>`;
        list.appendChild(el);
      }
    }
  }

  function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  }
});