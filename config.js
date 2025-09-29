// Configuration for Meeting Cost Ticker
window.MeetTicker = window.MeetTicker || {};

window.MeetTicker.config = {
    // API endpoints - same server for both frontend and backend
    endpoints: {
        auth: '', // Same server, root path
        participants: '/participants' // Same server, /participants path
    },

    // Polling configuration
    polling: {
        interval: 20, // seconds - configurable by user
        maxRetries: 3,
        retryDelay: 5000 // milliseconds
    },

    // UI configuration
    ui: {
        updateInterval: 1000, // milliseconds - how often to update the ticker display
        animationDuration: 300 // milliseconds
    },

    // OAuth configuration
    oauth: {
        scopes: ['https://www.googleapis.com/auth/meet.meetings.read']
    },

    // Local storage keys
    storage: {
        sessionId: 'meetTicker_sessionId',
        config: 'meetTicker_config',
        meetingState: 'meetTicker_meetingState'
    }
};

// Configuration management functions
window.MeetTicker.config.save = function() {
    try {
        localStorage.setItem(
            this.storage.config,
            JSON.stringify({
                polling: this.polling,
                ui: this.ui
            })
        );
        return true;
    } catch (error) {
        console.error('Failed to save configuration:', error);
        return false;
    }
};

window.MeetTicker.config.load = function() {
    try {
        const saved = localStorage.getItem(this.storage.config);
        if (saved) {
            const config = JSON.parse(saved);
            Object.assign(this.polling, config.polling || {});
            Object.assign(this.ui, config.ui || {});
        }
        return true;
    } catch (error) {
        console.error('Failed to load configuration:', error);
        return false;
    }
};

window.MeetTicker.config.reset = function() {
    try {
        localStorage.removeItem(this.storage.config);
        // Reset to defaults
        this.polling.interval = 20;
        this.polling.maxRetries = 3;
        this.polling.retryDelay = 5000;
        this.ui.updateInterval = 1000;
        this.ui.animationDuration = 300;
        return true;
    } catch (error) {
        console.error('Failed to reset configuration:', error);
        return false;
    }
};

// Validate configuration values
window.MeetTicker.config.validate = function() {
    // Ensure polling interval is within reasonable bounds
    if (this.polling.interval < 5) {
        this.polling.interval = 5;
    } else if (this.polling.interval > 300) {
        this.polling.interval = 300;
    }

    // Ensure retry settings are reasonable
    if (this.polling.maxRetries < 1) {
        this.polling.maxRetries = 1;
    } else if (this.polling.maxRetries > 10) {
        this.polling.maxRetries = 10;
    }

    if (this.polling.retryDelay < 1000) {
        this.polling.retryDelay = 1000;
    } else if (this.polling.retryDelay > 30000) {
        this.polling.retryDelay = 30000;
    }

    // Ensure UI update interval is reasonable
    if (this.ui.updateInterval < 100) {
        this.ui.updateInterval = 100;
    } else if (this.ui.updateInterval > 5000) {
        this.ui.updateInterval = 5000;
    }
};

// Initialize configuration on load
document.addEventListener('DOMContentLoaded', function() {
    window.MeetTicker.config.load();
    window.MeetTicker.config.validate();
});