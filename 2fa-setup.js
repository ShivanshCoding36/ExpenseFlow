/**
 * 2FA Setup Wizard JavaScript
 * Issue #503: 2FA Management
 */

let selectedMethod = 'totp';
let currentStep = 1;
let backupCodes = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    addMethodCardListeners();
});

/**
 * Setup event listeners
 */
function setupEventListeners() {
    const totpInput = document.getElementById('totp-code');
    if (totpInput) {
        totpInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
            if (e.target.value.length === 6) {
                verifyTOTP();
            }
        });
    }

    const backupCheckbox = document.getElementById('understood-backup');
    if (backupCheckbox) {
        backupCheckbox.addEventListener('change', (e) => {
            document.getElementById('complete-btn').disabled = !e.target.checked;
        });
    }
}

/**
 * Add method card click listeners
 */
function addMethodCardListeners() {
    document.querySelectorAll('.method-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.method-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedMethod = card.getAttribute('data-method');
        });
    });
}

/**
 * Proceed to setup
 */
async function proceedToSetup() {
    if (!selectedMethod) {
        alert('Please select a 2FA method');
        return;
    }

    try {
        const response = await fetch('/api/2fa/setup/initiate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to initiate 2FA setup');
        }

        const data = await response.json();

        if (selectedMethod === 'totp') {
            // Display QR code and manual entry key
            document.getElementById('qr-code').innerHTML = data.qrCode;
            document.getElementById('manual-key').textContent = data.manualEntryKey;

            // Move to setup step
            goToStep(2);
        }
    } catch (error) {
        console.error('Error:', error);
        alert(error.message || 'Failed to initiate 2FA setup');
    }
}

/**
 * Proceed to verify
 */
function proceedToVerify() {
    goToStep(3);
}

/**
 * Verify TOTP code
 */
async function verifyTOTP() {
    const code = document.getElementById('totp-code').value;

    if (!code || code.length !== 6) {
        showTOTPError('Please enter a valid 6-digit code');
        return;
    }

    const errorDiv = document.getElementById('totp-error');
    const loadingDiv = document.getElementById('totp-loading');

    errorDiv.classList.remove('show');
    loadingDiv.style.display = 'flex';

    try {
        const response = await fetch('/api/2fa/setup/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ code })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Invalid code');
        }

        const data = await response.json();
        backupCodes = data.backupCodes;

        // Display backup codes
        displayBackupCodes(backupCodes);

        // Move to backup codes step
        goToStep(4);
    } catch (error) {
        console.error('Error:', error);
        showTOTPError(error.message || 'Invalid code. Please try again.');
        document.getElementById('totp-code').value = '';
        document.getElementById('totp-code').focus();
    } finally {
        loadingDiv.style.display = 'none';
    }
}

/**
 * Show TOTP error
 */
function showTOTPError(message) {
    const errorDiv = document.getElementById('totp-error');
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
}

/**
 * Display backup codes
 */
function displayBackupCodes(codes) {
    const codesBox = document.getElementById('backup-codes-box');
    codesBox.textContent = codes.join('\n');
}

/**
 * Download backup codes
 */
function downloadBackupCodes() {
    const text = backupCodes.join('\n');
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', 'backup-codes.txt');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

/**
 * Print backup codes
 */
function printBackupCodes() {
    const printWindow = window.open('', '', 'height=400,width=600');
    printWindow.document.write('<pre>');
    printWindow.document.write('ExpenseFlow Backup Codes\n');
    printWindow.document.write('========================\n\n');
    printWindow.document.write(backupCodes.join('\n'));
    printWindow.document.write('\n\nKeep these codes safe. Each code can only be used once.');
    printWindow.document.write('</pre>');
    printWindow.document.close();
    printWindow.print();
}

/**
 * Copy backup codes
 */
function copyBackupCodes() {
    const text = backupCodes.join('\n');
    navigator.clipboard.writeText(text).then(() => {
        alert('Backup codes copied to clipboard');
    });
}

/**
 * Complete 2FA setup
 */
async function completeTwoFASetup() {
    const checkbox = document.getElementById('understood-backup');
    if (!checkbox.checked) {
        alert('Please confirm that you have saved your backup codes');
        return;
    }

    try {
        goToStep(5);
        showSuccessMessage();
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to complete setup');
    }
}

/**
 * Show success message
 */
function showSuccessMessage() {
    document.getElementById('step-success').style.display = 'block';
}

/**
 * Redirect to dashboard
 */
function redirectToDashboard() {
    window.location.href = '/dashboard';
}

/**
 * Go to step
 */
function goToStep(step) {
    // Hide all steps
    document.querySelectorAll('.wizard-step').forEach(s => {
        s.classList.remove('active');
    });

    // Show selected step
    if (step === 1) {
        document.getElementById('step-1').classList.add('active');
    } else if (step === 2) {
        if (selectedMethod === 'totp') {
            document.getElementById('step-2-totp').classList.add('active');
        }
    } else if (step === 3) {
        if (selectedMethod === 'totp') {
            document.getElementById('step-3-totp').classList.add('active');
            document.getElementById('totp-code').focus();
        }
    } else if (step === 4) {
        document.getElementById('step-4').classList.add('active');
    } else if (step === 5) {
        document.getElementById('step-success').classList.add('active');
    }

    // Update progress indicator
    updateProgressIndicator(step);

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Update progress indicator
 */
function updateProgressIndicator(step) {
    document.querySelectorAll('.step').forEach(s => {
        const stepNumber = parseInt(s.getAttribute('data-step'));
        s.classList.remove('active', 'completed');

        if (stepNumber < step) {
            s.classList.add('completed');
        } else if (stepNumber === step) {
            s.classList.add('active');
        }
    });
}

/**
 * Go back to method selection
 */
function goBackToMethodSelection() {
    goToStep(1);
}

/**
 * Go back to setup
 */
function goBackToSetup() {
    goToStep(2);
}

/**
 * Cancel setup
 */
function cancelSetup() {
    if (confirm('Are you sure you want to cancel 2FA setup?')) {
        window.location.href = '/settings';
    }
}

/**
 * Copy to clipboard
 */
function copyToClipboard(selector) {
    const element = document.querySelector(selector);
    const text = element.textContent;

    navigator.clipboard.writeText(text).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    });
}

/**
 * Get JWT token from localStorage
 */
function getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
}
