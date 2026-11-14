/* ============================================
   ENROLLMENT — runs the whole online enrollment for
   Garcia College of Technology: account, profile, program,
   subjects, documents, submit, registrar check, payment
   and the final enrollment slip.
   Data is kept in the browser for now (a stand-in for the
   SQL database in database.sql).
   ============================================ */
(function () {
  const app = document.getElementById('app');
  const nav = document.getElementById('nav');
  const toastBox = document.getElementById('toast');

  const STORAGE_KEY = 'gct_enroll_v2';
  const PER_UNIT = 650;
  const MISC_FEES = 3500;

  const STEP_NAMES = ['Account', 'Profile', 'Program', 'Subjects', 'Documents', 'Submit', 'Verification', 'Payment', 'Confirmation'];

  const REQUIREMENTS = [
    ['psa', 'PSA Birth Certificate'],
    ['f138', 'Form 138 / Report Card'],
    ['moral', 'Good Moral Certificate'],
    ['photo', '2x2 ID Photo']
  ];

  // Profile form: [id, label, input type]
  const PROFILE_FIELDS = [
    ['first', 'First name', 'text'],
    ['last', 'Last name', 'text'],
    ['birth', 'Date of birth', 'date'],
    ['mobile', 'Mobile number', 'tel'],
    ['address', 'Home address', 'text'],
    ['guardian', 'Parent / guardian name', 'text'],
    ['guardianMobile', 'Guardian mobile', 'tel'],
    ['school', 'Last school attended', 'text']
  ];

  // Each subject is written as: code | title | units | schedule | room
  const PROGRAMS = [
    {
      id: 'BSIT', name: 'BS Information Technology', about: 'Software, networks and data.',
      subjects: ['IT101|Introduction to Computing|3|Mon/Wed 8:00–9:30|Lab 1', 'IT102|Programming Fundamentals|3|Tue/Thu 8:00–9:30|Lab 2', 'GE101|Understanding the Self|3|Mon/Wed 10:00–11:30|Rm 201', 'MATH101|Discrete Mathematics|3|Tue/Thu 10:00–11:30|Rm 202', 'PE101|Physical Fitness|2|Fri 8:00–10:00|Gym']
    },
    {
      id: 'BSED', name: 'BS Education', about: 'Prepare to teach and lead classrooms.',
      subjects: ['ED101|Child and Adolescent Development|3|Mon/Wed 8:00–9:30|Rm 301', 'ED102|Foundations of Education|3|Tue/Thu 8:00–9:30|Rm 302', 'GE101|Understanding the Self|3|Mon/Wed 10:00–11:30|Rm 201', 'GE102|Purposive Communication|3|Tue/Thu 10:00–11:30|Rm 203', 'PE101|Physical Fitness|2|Fri 8:00–10:00|Gym']
    },
    {
      id: 'BSBA', name: 'BS Business Administration', about: 'Management, marketing and enterprise.',
      subjects: ['BA101|Principles of Management|3|Mon/Wed 1:00–2:30|Rm 401', 'BA102|Business Mathematics|3|Tue/Thu 1:00–2:30|Rm 402', 'GE101|Understanding the Self|3|Mon/Wed 10:00–11:30|Rm 201', 'ACC101|Fundamentals of Accounting|3|Tue/Thu 3:00–4:30|Rm 403', 'PE101|Physical Fitness|2|Fri 8:00–10:00|Gym']
    },
    {
      id: 'BSHM', name: 'BS Hospitality Management', about: 'Hotels, food service and tourism.',
      subjects: ['HM101|Introduction to Hospitality|3|Mon/Wed 8:00–9:30|Rm 501', 'HM102|Food Safety and Sanitation|3|Tue/Thu 8:00–9:30|Kitchen Lab', 'GE101|Understanding the Self|3|Mon/Wed 10:00–11:30|Rm 201', 'HM103|Front Office Operations|3|Tue/Thu 10:00–11:30|Rm 502', 'PE101|Physical Fitness|2|Fri 8:00–10:00|Gym']
    }
  ];

  let db = null;
  let backup = null;      // used when the browser blocks storage
  let mode = 'login';     // login or signup

  /* ---------- Small helpers ---------- */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function add(parent, children) {
    children.forEach(function (child) { parent.appendChild(child); });
    return parent;
  }

  function button(text, onClick, className) {
    const btn = el('button', 'btn ' + (className || ''), text);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
  }

  function field(label, type, id, value) {
    const wrap = el('label', '', label);
    const input = el('input');
    input.type = type;
    input.id = id;
    input.value = value || '';
    wrap.appendChild(input);
    return wrap;
  }

  function choice(label, id, options, value) {
    const wrap = el('label', '', label);
    const select = el('select');
    select.id = id;
    options.forEach(function (name) {
      const opt = el('option', '', name);
      opt.selected = name === value;
      select.appendChild(opt);
    });
    wrap.appendChild(select);
    return wrap;
  }

  function actions(buttons) {
    return add(el('div', 'row'), buttons);
  }

  function table(headers, rows) {
    const box = el('div', 'tw');
    const grid = el('table');
    const head = el('tr');
    headers.forEach(function (h) { head.appendChild(el('th', '', h)); });
    grid.appendChild(add(el('thead'), [head]));
    const body = el('tbody');
    rows.forEach(function (cells) {
      const tr = el('tr');
      cells.forEach(function (cell) {
        const td = el('td');
        if (typeof cell === 'string') td.textContent = cell;
        else td.appendChild(cell);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    grid.appendChild(body);
    box.appendChild(grid);
    return box;
  }

  function val(id) {
    return document.getElementById(id).value.trim();
  }

  function showError(message) {
    document.getElementById('error').textContent = message;
  }

  function toast(message) {
    toastBox.textContent = message;
    toastBox.className = 'on';
    setTimeout(function () { toastBox.className = ''; }, 2600);
  }

  function peso(amount) {
    return '₱' + amount.toLocaleString('en-PH');
  }

  async function hashText(text) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes)).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  /* ---------- Saved data ---------- */

  function saveDb() {
    backup = JSON.stringify(db);
    try { localStorage.setItem(STORAGE_KEY, backup); } catch (e) { /* storage blocked, keep going */ }
  }

  async function loadDb() {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { saved = null; }
    saved = saved || backup;
    if (saved) return JSON.parse(saved);

    // First visit: create the demo registrar account
    return {
      users: [{ id: 1, email: 'registrar@gct.edu', hash: await hashText('registrar123'), role: 'registrar', name: 'Registrar Office' }],
      profiles: {},
      enrollments: {},
      session: null,
      lastId: 1
    };
  }

  function currentUser() {
    return db.users.find(function (u) { return u.id === db.session; });
  }

  function currentEnrollment() {
    return db.enrollments[db.session];
  }

  function subjectsOf(program) {
    return program.subjects.map(function (line) {
      const p = line.split('|');
      return { code: p[0], title: p[1], units: Number(p[2]), schedule: p[3], room: p[4] };
    });
  }

  function programOf(enrollment) {
    return PROGRAMS.find(function (p) { return p.id === enrollment.program; });
  }

  function totalUnits(program) {
    return subjectsOf(program).reduce(function (sum, s) { return sum + s.units; }, 0);
  }

  function totalFee(program) {
    return totalUnits(program) * PER_UNIT + MISC_FEES;
  }

  function goToStep(step) {
    currentEnrollment().step = step;
    saveDb();
    render();
  }

  /* ---------- Page drawing ---------- */

  function render() {
    const user = currentUser();
    nav.replaceChildren();
    if (user) {
      nav.appendChild(el('span', 'nav-name', user.name));
      nav.appendChild(button('Log out', logOut, 'ghost sm'));
    }

    let view;
    if (!user) view = authView();
    else if (user.role === 'registrar') view = registrarView();
    else view = studentView(user);

    app.replaceChildren(view);
    window.scrollTo(0, 0);
  }

  function stepper(current) {
    const bar = el('nav', 'steps');
    bar.setAttribute('aria-label', 'Enrollment progress');
    STEP_NAMES.forEach(function (name, i) {
      const n = i + 1;
      const state = n < current ? 'done' : (n === current ? 'now' : '');
      const pill = el('span', 'st ' + state);
      if (n === current) pill.setAttribute('aria-current', 'step');
      pill.appendChild(el('b', '', n < current ? '✓' : String(n)));
      pill.appendChild(document.createTextNode(name));
      bar.appendChild(pill);
    });
    return bar;
  }

  function studentView(user) {
    const enrollment = currentEnrollment();
    const steps = { 2: profileStep, 3: programStep, 4: subjectsStep, 5: documentsStep, 6: submitStep, 7: verificationStep, 8: paymentStep, 9: confirmationStep };
    const page = el('div');
    page.appendChild(stepper(enrollment.step));
    page.appendChild(steps[enrollment.step](user, enrollment));
    return page;
  }

  /* ---------- Step 1: account ---------- */

  function authView() {
    const signingUp = mode === 'signup';

    const hero = el('section', 'hero');
    hero.appendChild(el('h1', '', 'Your next chapter starts here.'));
    hero.appendChild(el('p', '', 'Enroll at Garcia College of Technology online: create an account, pick a program, upload your documents and pay, all from your phone or computer.'));

    const card = el('div', 'card');
    card.appendChild(el('h2', '', signingUp ? 'Create your account' : 'Welcome back'));
    if (signingUp) card.appendChild(field('Full name', 'text', 'name'));
    card.appendChild(field('Email', 'email', 'email'));
    card.appendChild(field('Password', 'password', 'password'));
    const error = el('p', 'err');
    error.id = 'error';
    card.appendChild(error);
    card.appendChild(button(signingUp ? 'Create account' : 'Log in', signingUp ? signUp : logIn, 'full'));

    // Link that switches between log in and sign up
    const switcher = el('a', '', signingUp ? 'Log in' : 'Create an account');
    switcher.href = '#';
    switcher.addEventListener('click', function (event) {
      event.preventDefault();
      mode = signingUp ? 'login' : 'signup';
      render();
    });
    const switchLine = el('p', 'mut', signingUp ? 'Have an account? ' : 'New student? ');
    switchLine.appendChild(switcher);
    card.appendChild(switchLine);
    if (!signingUp) card.appendChild(el('p', 'mut small', 'Demo registrar: registrar@gct.edu / registrar123'));

    const panel = el('section', 'panel');
    panel.appendChild(card);
    return add(el('div', 'auth'), [hero, panel]);
  }

  async function signUp() {
    const name = val('name');
    const email = val('email').toLowerCase();
    const password = document.getElementById('password').value;

    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6) {
      return showError('Enter your name, a valid email and a password of 6 or more characters.');
    }
    if (db.users.some(function (u) { return u.email === email; })) {
      return showError('That email already has an account. Log in instead.');
    }

    db.lastId += 1;
    db.users.push({ id: db.lastId, email: email, hash: await hashText(password), role: 'student', name: name });
    db.enrollments[db.lastId] = { step: 2, status: 'draft', docs: {} };
    db.session = db.lastId;
    saveDb();
    render();
    toast('Account created');
  }

  async function logIn() {
    const email = val('email').toLowerCase();
    const hash = await hashText(document.getElementById('password').value);
    const user = db.users.find(function (u) { return u.email === email && u.hash === hash; });
    if (!user) return showError('Email or password is incorrect.');
    db.session = user.id;
    saveDb();
    render();
  }

  function logOut() {
    db.session = null;
    saveDb();
    render();
  }

  /* ---------- Step 2: profile ---------- */

  function profileStep(user) {
    const saved = db.profiles[user.id] || {};
    const card = el('div', 'card');
    card.appendChild(el('h2', '', 'Complete your profile'));

    const form = el('div', 'grid');
    PROFILE_FIELDS.forEach(function (f) {
      form.appendChild(field(f[1], f[2], f[0], saved[f[0]]));
    });
    form.appendChild(choice('Sex', 'sex', ['', 'Female', 'Male'], saved.sex));
    form.appendChild(choice('Student type', 'type', ['New student', 'Transferee'], saved.type));
    card.appendChild(form);

    const error = el('p', 'err');
    error.id = 'error';
    card.appendChild(error);
    card.appendChild(actions([button('Save and continue', saveProfile)]));
    return card;
  }

  function saveProfile() {
    const profile = {};
    PROFILE_FIELDS.forEach(function (f) { profile[f[0]] = val(f[0]); });
    profile.sex = val('sex');
    profile.type = val('type');

    const missing = Object.keys(profile).some(function (key) { return !profile[key]; });
    if (missing) return showError('Please fill in every field.');

    db.profiles[db.session] = profile;
    goToStep(3);
  }

  /* ---------- Step 3: program ---------- */

  function programStep(user, enrollment) {
    const card = el('div', 'card');
    card.appendChild(el('h2', '', 'Choose your academic program'));

    const list = el('div', 'progs');
    PROGRAMS.forEach(function (program) {
      const chosen = enrollment.program === program.id;
      const option = el('button', 'prog' + (chosen ? ' sel' : ''));
      option.type = 'button';
      option.setAttribute('aria-pressed', String(chosen));
      option.appendChild(el('h3', '', program.name));
      option.appendChild(el('span', 'mut', program.about));
      option.appendChild(el('br'));
      option.appendChild(el('span', 'tag', totalUnits(program) + ' units · 1st term'));
      option.addEventListener('click', function () {
        enrollment.program = program.id;
        saveDb();
        render();
      });
      list.appendChild(option);
    });
    card.appendChild(list);

    const error = el('p', 'err');
    error.id = 'error';
    card.appendChild(error);
    card.appendChild(actions([
      button('Back', function () { goToStep(2); }, 'alt'),
      button('Continue', function () {
        if (!enrollment.program) return showError('Select a program to continue.');
        goToStep(4);
      })
    ]));
    return card;
  }

  /* ---------- Step 4: subjects and schedule ---------- */

  function subjectsStep(user, enrollment) {
    const program = programOf(enrollment);
    const card = el('div', 'card');
    card.appendChild(el('h2', '', program.name + ': subjects and schedule'));

    const rows = subjectsOf(program).map(function (s) {
      return [s.code, s.title, String(s.units), s.schedule, s.room];
    });
    rows.push(['', 'Total units', String(totalUnits(program)), '', '']);
    card.appendChild(table(['Code', 'Subject', 'Units', 'Schedule', 'Room'], rows));

    card.appendChild(actions([
      button('Back', function () { goToStep(3); }, 'alt'),
      button('Continue to documents', function () { goToStep(5); })
    ]));
    return card;
  }

  /* ---------- Step 5: documents ---------- */

  function documentsStep(user, enrollment) {
    const card = el('div', 'card');
    card.appendChild(el('h2', '', 'Upload your requirements'));
    card.appendChild(el('p', 'mut', 'Accepted: PDF, JPG or PNG, up to 5 MB each.'));

    const list = el('div', 'grid');
    REQUIREMENTS.forEach(function (req) {
      const wrap = el('label', '', req[1]);
      const input = el('input');
      input.type = 'file';
      input.accept = '.pdf,.jpg,.jpeg,.png';
      input.addEventListener('change', function () {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          input.value = '';
          return toast('That file is over 5 MB');
        }
        enrollment.docs[req[0]] = file.name;   // only the file name is kept in this version
        saveDb();
        render();
      });
      wrap.appendChild(input);
      wrap.appendChild(el('span', 'mut', enrollment.docs[req[0]] ? '✓ ' + enrollment.docs[req[0]] : 'Not uploaded'));
      list.appendChild(wrap);
    });
    card.appendChild(list);

    const error = el('p', 'err');
    error.id = 'error';
    card.appendChild(error);
    card.appendChild(actions([
      button('Back', function () { goToStep(4); }, 'alt'),
      button('Continue', function () {
        const complete = REQUIREMENTS.every(function (req) { return enrollment.docs[req[0]]; });
        if (!complete) return showError('Upload all four requirements to continue.');
        goToStep(6);
      })
    ]));
    return card;
  }

  /* ---------- Step 6: submit ---------- */

  function submitStep(user, enrollment) {
    const profile = db.profiles[user.id];
    const card = el('div', 'card');
    card.appendChild(el('h2', '', 'Review and submit'));
    card.appendChild(el('p', '', profile.first + ' ' + profile.last + ' · ' + profile.type));
    card.appendChild(el('p', '', programOf(enrollment).name + ' · ' + totalUnits(programOf(enrollment)) + ' units'));
    card.appendChild(el('p', '', 'Documents uploaded: ' + Object.keys(enrollment.docs).length + ' of ' + REQUIREMENTS.length));
    card.appendChild(actions([
      button('Back', function () { goToStep(5); }, 'alt'),
      button('Submit enrollment', function () {
        enrollment.status = 'submitted';
        enrollment.submittedAt = new Date().toLocaleString();
        goToStep(7);
        toast('Enrollment submitted');
      })
    ]));
    return card;
  }

  /* ---------- Step 7: registrar verification (student side) ---------- */

  function verificationStep(user, enrollment) {
    const card = el('div', 'card');

    if (enrollment.status === 'returned') {
      card.appendChild(el('h2', '', 'The registrar returned your enrollment'));
      card.appendChild(el('p', 'err', enrollment.remarks));
      card.appendChild(actions([button('Fix documents and resubmit', function () {
        enrollment.status = 'draft';
        goToStep(5);
      })]));
      return card;
    }

    card.appendChild(el('h2', '', 'Waiting for registrar verification'));
    card.appendChild(el('p', '', 'Your documents were submitted on ' + enrollment.submittedAt + '. You can pay once the registrar verifies them.'));
    card.appendChild(el('span', 'tag', 'Status: pending review'));
    card.appendChild(actions([button('Refresh status', render, 'alt')]));
    return card;
  }

  /* ---------- Step 8: payment ---------- */

  function paymentStep(user, enrollment) {
    const program = programOf(enrollment);
    const card = el('div', 'card');
    card.appendChild(el('h2', '', 'Pay your fees'));
    card.appendChild(table(['Fee', 'Amount'], [
      ['Tuition (' + totalUnits(program) + ' units × ' + peso(PER_UNIT) + ')', peso(totalUnits(program) * PER_UNIT)],
      ['Miscellaneous fees', peso(MISC_FEES)],
      ['Total due', peso(totalFee(program))]
    ]));

    const form = el('div', 'grid gap');
    form.appendChild(choice('Payment method', 'method', ['GCash', 'Maya', 'Bank transfer', 'Pay at cashier']));
    form.appendChild(field('Reference number', 'text', 'reference'));
    card.appendChild(form);

    const error = el('p', 'err');
    error.id = 'error';
    card.appendChild(error);
    card.appendChild(actions([button('Pay ' + peso(totalFee(program)), function () {
      if (val('reference').length < 4) return showError('Enter the payment reference number.');
      enrollment.payment = { method: val('method'), reference: val('reference'), amount: totalFee(program) };
      enrollment.status = 'enrolled';
      enrollment.number = 'GCT-' + new Date().getFullYear() + '-' + String(1000 + db.session);
      goToStep(9);
      toast('Payment received');
    })]));
    card.appendChild(el('p', 'mut small', 'This is a prototype. No real payment is made.'));
    return card;
  }

  /* ---------- Step 9: confirmation ---------- */

  function confirmationStep(user, enrollment) {
    const profile = db.profiles[user.id];
    const program = programOf(enrollment);
    const card = el('div', 'card slip');
    card.appendChild(el('h2', '', 'You are officially enrolled!'));
    card.appendChild(el('p', '', ''));
    card.lastChild.appendChild(el('span', 'tag', enrollment.number));
    card.appendChild(el('p', '', profile.first + ' ' + profile.last + ' · ' + program.name));
    card.appendChild(el('p', '', 'Paid ' + peso(enrollment.payment.amount) + ' via ' + enrollment.payment.method + ' (ref ' + enrollment.payment.reference + ')'));

    card.appendChild(table(['Code', 'Subject', 'Units', 'Schedule'], subjectsOf(program).map(function (s) {
      return [s.code, s.title, String(s.units), s.schedule];
    })));
    card.appendChild(actions([button('Print enrollment slip', function () { window.print(); })]));
    return card;
  }

  /* ---------- Registrar ---------- */

  function registrarView() {
    const card = el('div', 'card');
    card.appendChild(el('h2', '', 'Registrar: enrollment queue'));

    // Only show students who have already submitted
    const queue = db.users.filter(function (u) {
      const e = db.enrollments[u.id];
      return u.role === 'student' && e && ['submitted', 'returned', 'verified', 'enrolled'].indexOf(e.status) !== -1;
    });

    if (!queue.length) {
      card.appendChild(el('p', 'mut', 'No submissions yet. Submitted enrollments will appear here for verification.'));
      return card;
    }

    const rows = queue.map(function (student) {
      const e = db.enrollments[student.id];
      const who = el('span', '', student.name);
      who.appendChild(el('br'));
      who.appendChild(el('span', 'mut', student.email));

      const docs = el('span', '', Object.keys(e.docs).map(function (k) { return e.docs[k]; }).join(', '));
      const status = el('span', 'tag', e.status === 'submitted' ? 'pending' : e.status);

      const action = el('div');
      if (e.status === 'submitted') {
        const remarks = el('input');
        remarks.id = 'remarks-' + student.id;
        remarks.placeholder = 'Remarks if returning';
        add(action, [
          remarks,
          button('Verify', function () { decide(student.id, true); }, 'sm'),
          button('Return', function () { decide(student.id, false); }, 'alt sm')
        ]);
      } else {
        action.textContent = '—';
      }
      return [who, programOf(e).id, docs, status, action];
    });

    card.appendChild(table(['Student', 'Program', 'Documents', 'Status', 'Action'], rows));
    return card;
  }

  function decide(studentId, approved) {
    const e = db.enrollments[studentId];
    const remarks = val('remarks-' + studentId);

    if (!approved && !remarks) return toast('Add remarks before returning');

    if (approved) {
      e.status = 'verified';
      e.step = 8;
    } else {
      e.status = 'returned';
      e.remarks = remarks;
    }
    saveDb();
    render();
    toast(approved ? 'Enrollment verified' : 'Returned to the student');
  }

  // Start the app
  loadDb().then(function (data) {
    db = data;
    render();
  });
})();