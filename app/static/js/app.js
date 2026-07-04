/* SpotDL Web - App JavaScript */

document.addEventListener('DOMContentLoaded', function() {
    // Auto-dismiss flash alerts after 5 seconds
    document.querySelectorAll('.flash-alert').forEach(function(alert) {
        setTimeout(function() {
            alert.style.opacity = '0';
            alert.style.transform = 'translateY(-8px)';
            setTimeout(function() { alert.remove(); }, 300);
        }, 5000);
    });

    // Close flash on button click
    document.querySelectorAll('.flash-close').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var alert = btn.closest('.flash-alert');
            alert.style.opacity = '0';
            alert.style.transform = 'translateY(-8px)';
            setTimeout(function() { alert.remove(); }, 300);
        });
    });

    // Mobile menu toggle
    var toggle = document.querySelector('.navbar-toggle');
    var actions = document.querySelector('.navbar-actions');
    if (toggle && actions) {
        toggle.addEventListener('click', function() {
            actions.classList.toggle('open');
            toggle.textContent = actions.classList.contains('open') ? '✕' : '☰';
        });
        document.addEventListener('click', function(e) {
            if (!toggle.contains(e.target) && !actions.contains(e.target)) {
                actions.classList.remove('open');
                toggle.textContent = '☰';
            }
        });
    }

    // Confirm delete actions
    document.querySelectorAll('.confirm-action').forEach(function(el) {
        el.addEventListener('click', function(e) {
            if (!confirm(el.dataset.confirm || 'Are you sure?')) {
                e.preventDefault();
            }
        });
    });
});

/* Auto-refresh active downloads */
var refreshInterval = null;

function startAutoRefresh() {
    if (refreshInterval) return;
    refreshInterval = setInterval(function() {
        var badges = document.querySelectorAll('.badge-processing, .badge-pending');
        if (badges.length === 0) {
            stopAutoRefresh();
            return;
        }
        badges.forEach(function(badge) {
            var item = badge.closest('.download-item');
            if (!item) return;
            var id = item.dataset.id;
            if (!id) return;
            fetch('/status/' + id)
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.status === 'completed' || data.status === 'failed') {
                        window.location.reload();
                    }
                })
                .catch(function() {});
        });
    }, 4000);
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

/* Start auto-refresh if there are active downloads */
if (document.querySelector('.badge-processing, .badge-pending')) {
    startAutoRefresh();
}
