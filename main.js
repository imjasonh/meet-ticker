// Meeting Cost Ticker - Main Application
(function () {
    'use strict';

    // Configuration constants
    const POLLING_INTERVAL_SECONDS = 5;

    // Application state
    let appState = {
        isAuthenticated: false,
        isTracking: false,
        sessionId: null,
        accessToken: null,
        conferenceId: null,
        startTime: null,
        totalPersonSeconds: 0,
        currentParticipantCount: 0,
        lastParticipantUpdate: null,
        errorCount: 0,
        // Meet communication
        meetChannel: null,
        meetOrigin: null,
        meetingInfoPromiseResolve: null
    };

    // Timer intervals
    let tickerInterval = null;
    let participantPollingInterval = null;

    // DOM elements
    let elements = {};

    // Initialize the application
    function init() {
        console.log('Initializing Meeting Cost Ticker...');
        console.log('User agent:', navigator.userAgent);
        console.log('Location:', window.location.href);
        console.log('Meet SDK available:', typeof window.meet !== 'undefined');
        console.log('Meet addon available:', typeof window.meet?.addon !== 'undefined');

        // Check for other possible Meet-related globals
        console.log('Available globals:', Object.keys(window).filter(key =>
            key.toLowerCase().includes('meet') ||
            key.toLowerCase().includes('google') ||
            key.toLowerCase().includes('addon')
        ));

        // Check URL parameters for Meet SDK information
        const urlParams = new URLSearchParams(window.location.search);
        const meetSdkParam = urlParams.get('meet_sdk');
        console.log('Meet SDK URL parameter:', meetSdkParam);

        if (meetSdkParam) {
            try {
                // Try to decode the base64 parameter
                const decoded = atob(meetSdkParam);
                console.log('Decoded Meet SDK param:', decoded);
                const parsed = JSON.parse(decoded);
                console.log('Parsed Meet SDK data:', parsed);
            } catch (error) {
                console.log('Error decoding Meet SDK parameter:', error);
            }
        }

        try {
            // Get DOM elements
            cacheElements();

            // Set up event listeners
            setupEventListeners();

            // Load saved state
            loadSavedState();

            // Initialize views
            showView('auth');

            // Try to auto-initialize if we're in a Meet context
            initializeMeetContext();

            console.log('Meeting Cost Ticker initialized successfully');

            // Update debug status
            const debugStatus = document.getElementById('debug-status');
            if (debugStatus) {
                //debugStatus.textContent = 'Initialized';
                //debugStatus.style.background = 'green';
                debugStatus.style.visibility = 'hidden';
            }
        } catch (error) {
            console.error('Failed to initialize Meeting Cost Ticker:', error);

            // Update debug status with error
            const debugStatus = document.getElementById('debug-status');
            if (debugStatus) {
                debugStatus.textContent = 'Error: ' + error.message;
                debugStatus.style.background = 'red';
            }

            handleError(error, 'initialization');
        }
    }

    // Cache DOM elements for performance
    function cacheElements() {
        elements = {
            // Views
            authView: document.getElementById('auth-view'),
            tickerView: document.getElementById('ticker-view'),
            errorView: document.getElementById('error-view'),

            // Auth view elements
            authorizeButton: document.getElementById('authorize-button'),
            authStatus: document.getElementById('auth-status'),

            // Ticker view elements
            costTicker: document.getElementById('cost-ticker'),
            costUnit: document.getElementById('cost-unit'),
            meetingStatus: document.getElementById('meeting-status'),
            participantCount: document.getElementById('participant-count'),
            elapsedTime: document.getElementById('elapsed-time'),
            tickerStatus: document.getElementById('ticker-status'),

            // Error view elements
            errorMessage: document.getElementById('error-message'),
            retryButton: document.getElementById('retry-button'),

        };
    }

    // Set up event listeners
    function setupEventListeners() {
        // Auth button
        if (elements.authorizeButton) {
            elements.authorizeButton.addEventListener('click', handleAuthentication);
        }

        if (elements.retryButton) {
            elements.retryButton.addEventListener('click', handleRetry);
        }


        // Listen for OAuth callback messages
        window.addEventListener('message', handleOAuthMessage);

        // Handle page visibility changes
        document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // Show a specific view
    function showView(viewName) {
        const views = ['auth', 'ticker', 'error'];
        views.forEach(view => {
            const element = elements[view + 'View'];
            if (element) {
                element.classList.toggle('hidden', view !== viewName);
            }
        });
    }

    // Update status message
    function updateStatus(elementId, message, type = 'info') {
        const element = elements[elementId];
        if (element) {
            element.textContent = message;
            element.className = `status-message ${type}`;
        }
    }

    // Format time duration
    function formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }

    // Format number with commas
    function formatNumber(num) {
        return num.toLocaleString();
    }

    // Basic timer functionality
    function startTicker() {
        if (tickerInterval) {
            clearInterval(tickerInterval);
        }

        appState.startTime = appState.startTime || Date.now();
        appState.isTracking = true;

        console.log('Starting ticker...');

        // Always update every second for responsive meeting duration display
        tickerInterval = setInterval(updateTicker, 1000);
        updateTicker(); // Initial update

        if (elements.meetingStatus) {
            elements.meetingStatus.textContent = 'Active';
            elements.meetingStatus.className = 'status-badge';
        }
    }

    function updateTicker() {
        if (!appState.startTime) return;

        const now = Date.now();
        const elapsedSeconds = (now - appState.startTime) / 1000;

        // Update elapsed time display
        if (elements.elapsedTime) {
            elements.elapsedTime.textContent = formatDuration(elapsedSeconds);
        }

        // Increment person-seconds if we have participants
        if (appState.currentParticipantCount > 0) {
            // Add current participant count to total (this happens every second)
            appState.totalPersonSeconds += appState.currentParticipantCount;
        }

        // Update cost display with automatic unit switching
        const personMinutes = appState.totalPersonSeconds / 60;

        if (personMinutes >= 60) {
            // Switch to person-hours when >= 60 minutes (no decimals)
            const personHours = personMinutes / 60;
            if (elements.costTicker) {
                elements.costTicker.textContent = formatNumber(Math.round(personHours));
            }
            if (elements.costUnit) {
                elements.costUnit.textContent = 'person-hours';
            }
        } else if (personMinutes >= 1) {
            // Show person-minutes when >= 1 minute (no decimals)
            if (elements.costTicker) {
                elements.costTicker.textContent = formatNumber(Math.round(personMinutes));
            }
            if (elements.costUnit) {
                elements.costUnit.textContent = 'person-minutes';
            }
        } else {
            // Show person-seconds when < 1 minute
            if (elements.costTicker) {
                elements.costTicker.textContent = formatNumber(Math.round(appState.totalPersonSeconds));
            }
            if (elements.costUnit) {
                elements.costUnit.textContent = 'person-seconds';
            }
        }


        // Update participant count display
        if (elements.participantCount) {
            const countText = appState.currentParticipantCount === 1
                ? '1 participant'
                : `${appState.currentParticipantCount} participants`;
            elements.participantCount.textContent = countText;
        }

        // Save state periodically
        saveState();
    }

    // Reset tracking data for new meetings
    function resetTrackingData() {
        console.log('Resetting tracking data for new meeting');
        appState.totalPersonSeconds = 0;
        appState.startTime = null;
        appState.currentParticipantCount = 0;
        appState.lastParticipantUpdate = null;
        appState.errorCount = 0;

        // Clear any existing intervals
        if (tickerInterval) {
            clearInterval(tickerInterval);
            tickerInterval = null;
        }
        if (participantPollingInterval) {
            clearInterval(participantPollingInterval);
            participantPollingInterval = null;
        }

        // Save the reset state
        saveState();
    }

    // Event handlers
    function handleAuthentication() {
        console.log('Starting authentication...');
        updateStatus('authStatus', 'Starting authentication...', 'info');

        // Open authentication window
        const authUrl = window.MeetTicker.config.endpoints.auth + '/auth';
        const authWindow = window.open(authUrl, 'meetTickerAuth', 'width=600,height=700,scrollbars=yes,resizable=yes');

        if (!authWindow) {
            updateStatus('authStatus', 'Please allow popups and try again', 'error');
            return;
        }

        // Poll for window closure as backup
        const pollTimer = setInterval(() => {
            if (authWindow.closed) {
                clearInterval(pollTimer);
                updateStatus('authStatus', 'Authentication cancelled', 'warning');
            }
        }, 1000);
    }

    function handleOAuthMessage(event) {
        console.log('Received OAuth message:', event.data);

        if (event.data && event.data.type === 'auth_success' && event.data.sessionId) {
            appState.sessionId = event.data.sessionId;

            console.log('Authentication successful, session ID:', appState.sessionId);
            updateStatus('authStatus', 'Authentication successful! Getting access token...', 'success');

            // Retrieve the access token
            getAccessToken(appState.sessionId)
                .then(() => {
                    appState.isAuthenticated = true;
                    updateStatus('authStatus', 'Ready to start tracking!', 'success');

                    // Save session
                    saveState();

                    // Initialize meeting context
                    setTimeout(() => {
                        initializeMeetContext();
                    }, 1000);
                })
                .catch(error => {
                    console.error('Failed to get access token:', error);
                    updateStatus('authStatus', 'Failed to get access token', 'error');
                });
        }
    }

    // Retrieve access token from backend
    async function getAccessToken(sessionId) {
        try {
            console.log('Retrieving access token for session:', sessionId);

            const response = await fetch(`${window.MeetTicker.config.endpoints.auth}/token?sessionId=${sessionId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get token: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            appState.accessToken = data.access_token;

            console.log('Access token retrieved successfully');
            return data;

        } catch (error) {
            console.error('Error getting access token:', error);
            throw error;
        }
    }

    function handleRetry() {
        console.log('Retrying...');
        appState.errorCount = 0;

        if (appState.isAuthenticated) {
            initializeMeetContext();
        } else {
            showView('auth');
        }
    }

    function handleVisibilityChange() {
        if (document.hidden) {
            console.log('Page hidden, maintaining tracking...');
        } else {
            console.log('Page visible, resuming normal operation...');
            if (appState.isTracking) {
                updateTicker();
            }
        }
    }


    // Meet add-on integration using proper SDK
    async function initializeMeetContext() {
        console.log('Initializing Meet context...');

        try {
            // Wait for Meet SDK to be fully initialized
            updateStatus('authStatus', 'Waiting for Meet SDK...', 'info');

            const meetSDK = await waitForMeetSDKInitialization(10000);

            if (!meetSDK) {
                // If waiting didn't work, try using the SDK anyway
                console.log('SDK not fully initialized, but trying anyway...');
                if (typeof window.meet?.addon === 'undefined') {
                    throw new Error('Meet add-ons SDK not available at all');
                }
            }

            console.log('Proceeding with Meet SDK initialization...');
            console.log('window.meet properties:', Object.keys(window.meet || {}));
            console.log('window.meet.addon properties:', Object.keys(window.meet.addon || {}));

            updateStatus('authStatus', 'Creating add-on session...', 'info');

            // Initialize the Meet add-on session first
            console.log('Creating Meet add-on session...');
            console.log('Available methods on window.meet.addon:', Object.keys(window.meet.addon || {}));

            // Get the cloud project number from the URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            const meetSdkParam = urlParams.get('meet_sdk');
            let cloudProjectNumber = null;

            if (meetSdkParam) {
                try {
                    const meetSdkData = JSON.parse(atob(meetSdkParam));
                    cloudProjectNumber = meetSdkData[3]; // Project number is 4th element
                    console.log('Using project number from Meet SDK:', cloudProjectNumber);
                } catch (error) {
                    console.error('Error parsing project number from Meet SDK:', error);
                }
            }

            if (!cloudProjectNumber) {
                throw new Error('Could not determine cloud project number from Meet SDK');
            }

            const session = await window.meet.addon.createAddonSession({
                cloudProjectNumber: cloudProjectNumber
            });

            console.log('Add-on session created:', session);

            // Now create the side panel client from the session
            console.log('Creating side panel client from session...');
            const sidePanelClient = await session.createSidePanelClient();
            console.log('Side panel client created:', sidePanelClient);

            // Get meeting information
            const meetingInfo = await sidePanelClient.getMeetingInfo();
            console.log('Meeting info from SDK:', meetingInfo);

            if (meetingInfo && meetingInfo.meetingId) {
                const newMeetingId = meetingInfo.meetingId;
                console.log('Meeting ID from Meet SDK:', newMeetingId);

                // Check if this is a new meeting - reset tracking if so
                if (appState.conferenceId && appState.conferenceId !== newMeetingId) {
                    console.log('New meeting detected, resetting tracking data');
                    resetTrackingData();
                }

                appState.conferenceId = newMeetingId;

                // Start with at least 1 participant (the current user)
                appState.currentParticipantCount = 1;

                showView('ticker');
                startTicker();
                startParticipantPolling();

                updateStatus('tickerStatus', 'Connected to meeting - starting tracking...', 'success');
            } else {
                throw new Error('Could not get meeting information from Meet SDK');
            }

        } catch (error) {
            console.error('Error initializing Meet context:', error);
            updateStatus('authStatus', 'Failed to connect to Meet: ' + error.message, 'error');
            showView('error');

            if (elements.errorMessage) {
                elements.errorMessage.textContent = 'Failed to connect to Meet: ' + error.message;
            }
        }
    }

    // Wait for Meet SDK to be fully initialized
    function waitForMeetSDKInitialization(timeoutMs = 10000) {
        return new Promise((resolve) => {
            // Check if SDK is fully initialized (has methods in addon object)
            function isSDKReady() {
                return window.meet?.addon && Object.keys(window.meet.addon).length > 0;
            }

            // If already initialized, resolve immediately
            if (isSDKReady()) {
                console.log('Meet SDK already initialized');
                resolve(window.meet);
                return;
            }

            const checkInterval = 100; // Check every 100ms
            let elapsed = 0;

            const intervalId = setInterval(() => {
                elapsed += checkInterval;

                console.log(`Waiting for SDK initialization... ${elapsed}ms, addon keys:`, Object.keys(window.meet?.addon || {}));

                if (isSDKReady()) {
                    console.log('Meet SDK became fully initialized after', elapsed, 'ms');
                    console.log('Available addon methods:', Object.keys(window.meet.addon));
                    clearInterval(intervalId);
                    resolve(window.meet);
                } else if (elapsed >= timeoutMs) {
                    console.log('Meet SDK not fully initialized after', elapsed, 'ms timeout');
                    console.log('Final addon state:', window.meet?.addon);
                    clearInterval(intervalId);
                    resolve(null);
                }
            }, checkInterval);
        });
    }

    // Participant polling with real API integration
    function startParticipantPolling() {
        if (participantPollingInterval) {
            clearInterval(participantPollingInterval);
        }

        console.log('Starting participant polling every', POLLING_INTERVAL_SECONDS, 'seconds');

        // Initial poll
        pollParticipantCount();

        participantPollingInterval = setInterval(() => {
            if (appState.conferenceId) {
                pollParticipantCount();
            }
        }, POLLING_INTERVAL_SECONDS * 1000);
    }

    // Poll for participant count from the backend
    async function pollParticipantCount() {
        console.log('pollParticipantCount called - accessToken:', !!appState.accessToken, 'conferenceId:', appState.conferenceId);

        if (!appState.accessToken || !appState.conferenceId) {
            console.log('Missing access token or conference ID for participant polling');
            // For now, set a minimum of 1 participant (the user)
            appState.currentParticipantCount = Math.max(1, appState.currentParticipantCount);
            return;
        }

        try {
            console.log('Polling participant count for conference:', appState.conferenceId);

            const response = await fetch(window.MeetTicker.config.endpoints.participants, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${appState.accessToken}`
                },
                body: JSON.stringify({
                    conferenceId: appState.conferenceId
                })
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            appState.currentParticipantCount = data.participantCount || 0;
            appState.lastParticipantUpdate = Date.now();
            appState.errorCount = 0; // Reset error count on success

            console.log('Updated participant count:', appState.currentParticipantCount);
            updateStatus('tickerStatus', `Last updated: ${new Date().toLocaleTimeString()}`, 'info');

        } catch (error) {
            console.error('Failed to poll participant count:', error);
            appState.errorCount++;

            // Handle different types of errors
            if (error.message.includes('401')) {
                updateStatus('tickerStatus', 'Authentication expired - please re-authenticate', 'error');
            } else if (error.message.includes('403')) {
                updateStatus('tickerStatus', 'Access denied - check permissions', 'error');
            } else if (error.message.includes('404')) {
                updateStatus('tickerStatus', 'Meeting not found', 'error');
            } else {
                updateStatus('tickerStatus', `API error (attempt ${appState.errorCount})`, 'warning');
            }

            // If too many errors, stop polling
            if (appState.errorCount >= window.MeetTicker.config.polling.maxRetries) {
                console.log('Too many polling errors, stopping participant polling');
                clearInterval(participantPollingInterval);
                updateStatus('tickerStatus', 'Polling stopped due to errors - using last known count', 'error');
            }
        }
    }

    // State persistence
    function saveState() {
        try {
            const state = {
                sessionId: appState.sessionId,
                accessToken: appState.accessToken,
                isAuthenticated: appState.isAuthenticated,
                isTracking: appState.isTracking,
                startTime: appState.startTime,
                totalPersonSeconds: appState.totalPersonSeconds,
                currentParticipantCount: appState.currentParticipantCount,
                conferenceId: appState.conferenceId
            };

            localStorage.setItem(window.MeetTicker.config.storage.meetingState, JSON.stringify(state));
        } catch (error) {
            console.error('Failed to save state:', error);
        }
    }

    function loadSavedState() {
        try {
            const saved = localStorage.getItem(window.MeetTicker.config.storage.meetingState);
            if (saved) {
                const state = JSON.parse(saved);
                Object.assign(appState, state);
                console.log('Loaded saved state:', state);
            }
        } catch (error) {
            console.error('Failed to load saved state:', error);
        }
    }

    // Error handling
    function handleError(error, context = '') {
        console.error('Error in', context, ':', error);
        appState.errorCount++;

        let errorMessage = 'An unexpected error occurred';

        if (error.message) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        }

        if (elements.errorMessage) {
            elements.errorMessage.textContent = errorMessage;
        }

        showView('error');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export for debugging
    window.MeetTicker = window.MeetTicker || {};
    window.MeetTicker.app = {
        state: appState,
        startTicker,
        showView
    };

})();
