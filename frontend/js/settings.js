import { requireAuth, apiFetch, loadComponent } from './config.js';

requireAuth();

loadComponent('#sidebar-container', '../components/sidebar.html').then(() => {
  if (window.lucide) window.lucide.createIcons();
});
loadComponent('#navbar-container', '../components/navbar.html').then(() => {
  if (window.lucide) window.lucide.createIcons();
});

if (window.lucide) {
  window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', () => {
  loadProfile();
  setupEventListeners();
});

async function loadProfile() {
  try {
    const data = await apiFetch('/api/auth/me');
    if (data.business) {
      document.getElementById('busName').value = data.business.name || '';
      document.getElementById('busEmail').value = data.business.email || '';
      document.getElementById('busPhone').value = data.business.phone || '';
      
      const industrySelect = document.getElementById('busIndustry');
      const indVal = data.business.industry || '';
      
      // If industry exists but isn't in options, add it
      if (indVal && !Array.from(industrySelect.options).find(o => o.value === indVal)) {
        const opt = document.createElement('option');
        opt.value = indVal;
        opt.textContent = indVal;
        industrySelect.appendChild(opt);
      }
      industrySelect.value = indVal;
    }
  } catch (err) {
    console.error('Failed to load profile', err);
    showMessage('profileMsg', 'Failed to load profile data', 'error');
  }
}

function setupEventListeners() {
  const profileForm = document.getElementById('profileForm');
  const passwordForm = document.getElementById('passwordForm');

  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSaveProfile');
    btn.disabled = true;
    btn.innerHTML = 'Saving...';
    showMessage('profileMsg', '');

    try {
      const payload = {
        name: document.getElementById('busName').value,
        industry: document.getElementById('busIndustry').value,
        phone: document.getElementById('busPhone').value
      };
      
      const data = await apiFetch('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      
      showMessage('profileMsg', 'Profile updated successfully!', 'success');
      
      // Update localStorage with new name if needed
      const currentAuth = JSON.parse(localStorage.getItem('insightloop_auth') || '{}');
      if (currentAuth.business) {
        currentAuth.business.name = payload.name;
        localStorage.setItem('insightloop_auth', JSON.stringify(currentAuth));
      }
    } catch (err) {
      showMessage('profileMsg', err.message || 'Failed to update profile', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Save Changes';
    }
  });

  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currPass = document.getElementById('currPass').value;
    const newPass = document.getElementById('newPass').value;
    const confPass = document.getElementById('confPass').value;

    if (newPass !== confPass) {
      showMessage('passMsg', 'New passwords do not match!', 'error');
      return;
    }

    if (newPass.length < 8) {
      showMessage('passMsg', 'New password must be at least 8 characters.', 'error');
      return;
    }

    const btn = document.getElementById('btnChangePass');
    btn.disabled = true;
    btn.innerHTML = 'Updating...';
    showMessage('passMsg', '');

    try {
      await apiFetch('/api/auth/change-password', {
        method: 'PUT',
        body: JSON.stringify({
          current_password: currPass,
          new_password: newPass
        })
      });
      
      showMessage('passMsg', 'Password changed successfully!', 'success');
      passwordForm.reset();
    } catch (err) {
      showMessage('passMsg', err.message || 'Failed to change password', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Change Password';
    }
  });
}

function showMessage(elementId, text, type = 'info') {
  const el = document.getElementById(elementId);
  el.textContent = text;
  el.className = 'form-msg';
  if (text) {
    el.classList.add(`msg-${type}`);
  }
}
