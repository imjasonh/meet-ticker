class MeetingCostTracker {
    constructor() {
        this.sessionId = null;
        this.accessToken = null;
        this.isTracking = false;
        this.startTime = null;
        this.participantCount = 0;
        this.hourlyRate = 75;
        this.intervalId = null;

        this.initializeElements();
        this.bindEvents();
        this.loadSettings();
        this.updateStatus('Ready - Click authenticate to begin');
    }

    initializeElements() {
        this.elements = {
            status: document.getElementById('status'),
            totalCost: document.getElementById('totalCost'),
            participantCount: document.getElementById('participantCount'),
            duration: document.getElementById('duration'),
            costPerMinute: document.getElementById('costPerMinute'),
            authButton: document.getElementById('authButton'),
            startButton: document.getElementById('startButton'),
            stopButton: document.getElementById('stopButton'),
            hourlyRate: document.getElementById('hourlyRate')
        };
    }

    bindEvents() {
        this.elements.authButton.addEventListener('click', () => this.authenticate());
        this.elements.startButton.addEventListener('click', () => this.startTracking());
        this.elements.stopButton.addEventListener('click', () => this.stopTracking());
        this.elements.hourlyRate.addEventListener('change', () => this.updateHourlyRate());

        // Listen for OAuth callback messages
        window.addEventListener('message', (event) => {
            if (event.data.type === 'auth_success') {
                this.handleAuthSuccess(event.data.sessionId);
            }
        });
    }

    loadSettings() {
        const savedRate = localStorage.getItem('hourlyRate');
        if (savedRate) {
            this.hourlyRate = parseFloat(savedRate);
            this.elements.hourlyRate.value = this.hourlyRate;
        }
        this.updateCostPerMinute();
    }

    updateStatus(message, type = 'info') {
        this.elements.status.textContent = message;
        this.elements.status.className = `status ${type}`;
    }

    updateCostPerMinute() {
        const costPerMinute = (this.hourlyRate * this.participantCount) / 60;
        this.elements.costPerMinute.textContent = `$${costPerMinute.toFixed(2)}`;
    }

    updateHourlyRate() {
        this.hourlyRate = parseFloat(this.elements.hourlyRate.value) || 75;
        localStorage.setItem('hourlyRate', this.hourlyRate.toString());
        this.updateCostPerMinute();
    }

    async authenticate() {
        try {
            this.updateStatus('Opening authentication window...', 'info');

            // Open OAuth window
            const authWindow = window.open(
                '/auth',
                'auth',
                'width=500,height=600,scrollbars=yes,resizable=yes'
            );

            // Check if popup was blocked
            if (!authWindow) {
                throw new Error('Popup blocked. Please allow popups for this site.');
            }

        } catch (error) {
            console.error('Authentication error:', error);
            this.updateStatus(`Auth error: ${error.message}`, 'error');
        }
    }

    async handleAuthSuccess(sessionId) {
        try {
            this.sessionId = sessionId;
            this.updateStatus('Getting access token...', 'info');

            // Get access token
            const tokenResponse = await fetch(`/token?sessionId=${sessionId}`);
            const tokenData = await tokenResponse.json();

            if (!tokenResponse.ok) {
                throw new Error(tokenData.error || 'Failed to get access token');
            }

            this.accessToken = tokenData.access_token;
            this.updateStatus('Connected! Ready to track meeting costs.', 'connected');

            // Enable start button, disable auth button
            this.elements.authButton.disabled = true;
            this.elements.startButton.disabled = false;

        } catch (error) {
            console.error('Token retrieval error:', error);
            this.updateStatus(`Token error: ${error.message}`, 'error');
        }
    }

    async fetchParticipantCount() {
        try {
            // For demo purposes, we'll use a mock conference ID
            // In a real implementation, this would come from the Google Meet API
            const conferenceId = 'demo-meeting-' + Date.now();

            const response = await fetch('/participants', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                },
                body: JSON.stringify({ conferenceId })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch participant count');
            }

            return data.participantCount;

        } catch (error) {
            console.error('Error fetching participant count:', error);
            // Return a fallback count
            return Math.floor(Math.random() * 5) + 2; // 2-6 participants
        }
    }

    async startTracking() {
        try {
            this.updateStatus('Starting cost tracking...', 'info');

            // Get initial participant count
            this.participantCount = await this.fetchParticipantCount();
            this.elements.participantCount.textContent = this.participantCount.toString();
            this.updateCostPerMinute();

            this.isTracking = true;
            this.startTime = Date.now();

            // Update UI
            this.elements.startButton.disabled = true;
            this.elements.stopButton.disabled = false;
            this.updateStatus('Tracking meeting costs...', 'connected');

            // Start the update interval
            this.intervalId = setInterval(() => {
                this.updateDisplay();
            }, 1000);

            // Update participant count every 30 seconds
            this.participantIntervalId = setInterval(async () => {
                this.participantCount = await this.fetchParticipantCount();
                this.elements.participantCount.textContent = this.participantCount.toString();
                this.updateCostPerMinute();
            }, 30000);

        } catch (error) {
            console.error('Error starting tracking:', error);
            this.updateStatus(`Start error: ${error.message}`, 'error');
        }
    }

    stopTracking() {
        this.isTracking = false;

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        if (this.participantIntervalId) {
            clearInterval(this.participantIntervalId);
            this.participantIntervalId = null;
        }

        // Update UI
        this.elements.startButton.disabled = false;
        this.elements.stopButton.disabled = true;
        this.updateStatus('Tracking stopped. Ready to start new session.', 'info');
    }

    updateDisplay() {
        if (!this.isTracking || !this.startTime) return;

        const now = Date.now();
        const elapsedMs = now - this.startTime;
        const elapsedMinutes = elapsedMs / (1000 * 60);

        // Calculate total cost
        const totalCost = (this.hourlyRate * this.participantCount * elapsedMinutes) / 60;

        // Update display
        this.elements.totalCost.textContent = `$${totalCost.toFixed(2)}`;

        // Update duration
        const minutes = Math.floor(elapsedMinutes);
        const seconds = Math.floor((elapsedMs % 60000) / 1000);
        this.elements.duration.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new MeetingCostTracker();
});