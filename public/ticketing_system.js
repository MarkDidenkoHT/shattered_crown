let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;
let _userTickets = [];

export async function loadModule(main, { apiCall, getCurrentProfile }) {
    _main = main;
    _apiCall = apiCall;
    _getCurrentProfile = getCurrentProfile;

    _profile = _getCurrentProfile();
    if (!_profile) {
        displayMessage('User profile not found. Please log in again.');
        return;
    }

    await showSupportModal();
}

async function showSupportModal() {
    // Fetch user tickets first
    await fetchUserTickets();

    const modal = document.createElement('div');
    modal.className = 'support-modal';
    modal.innerHTML = `
        <div class="support-modal-content">
            <div class="support-header">
                <h2>Support Center</h2>
                <button class="support-close-btn">&times;</button>
            </div>
            <div class="support-tabs">
                <button class="support-tab-btn active" data-tab="new-ticket">New Ticket</button>
                <button class="support-tab-btn" data-tab="ticket-history">Ticket History</button>
            </div>
            <div class="support-body">
                <div class="support-tab-content active" id="new-ticket-tab">
                    <form class="new-ticket-form">
                        <div class="form-group">
                            <label for="ticket-subject">Subject:</label>
                            <select id="ticket-subject" required>
                                <option value="">Select a category...</option>
                                <option value="bug-report">Bug Report</option>
                                <option value="feature-request">Feature Request</option>
                                <option value="account-issue">Account Issue</option>
                                <option value="gameplay-help">Gameplay Help</option>
                                <option value="technical-support">Technical Support</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="ticket-description">Description:</label>
                            <textarea id="ticket-description" placeholder="Please describe your issue in detail..." required rows="6"></textarea>
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="fantasy-button submit-ticket-btn">Submit Ticket</button>
                        </div>
                    </form>
                </div>
                <div class="support-tab-content" id="ticket-history-tab">
                    <div class="ticket-history-container">
                        ${renderTicketHistory()}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    addSupportStyles();
    setupSupportModalEvents(modal);
}

function renderTicketHistory() {
    if (_userTickets.length === 0) {
        return `
            <div class="no-tickets">
                <p>You haven't submitted any tickets yet.</p>
                <p>Use the "New Ticket" tab to contact support.</p>
            </div>
        `;
    }

    return `
        <div class="tickets-list">
            ${_userTickets.map(ticket => `
                <div class="ticket-item ${ticket.status?.toLowerCase() || 'open'}">
                    <div class="ticket-header">
                        <div class="ticket-id">#${ticket.id}</div>
                        <div class="ticket-status status-${ticket.status?.toLowerCase() || 'open'}">${ticket.status || 'Open'}</div>
                    </div>
                    <div class="ticket-content">
                        <div class="ticket-date">${formatDate(ticket.created_at)}</div>
                        <div class="ticket-text">${ticket.ticket_text || 'No description provided'}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function setupSupportModalEvents(modal) {
    // Close modal functionality
    modal.querySelector('.support-close-btn').addEventListener('click', () => {
        modal.remove();
        window.gameAuth.loadModule('castle'); // Return to castle
    });

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
            window.gameAuth.loadModule('castle'); // Return to castle
        }
    });

    // Close modal with Escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            window.gameAuth.loadModule('castle'); // Return to castle
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);

    // Tab switching
    modal.querySelectorAll('.support-tab-btn').forEach(tabBtn => {
        tabBtn.addEventListener('click', (e) => {
            const targetTab = e.target.dataset.tab;
            
            // Update tab buttons
            modal.querySelectorAll('.support-tab-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            
            // Update tab content
            modal.querySelectorAll('.support-tab-content').forEach(content => content.classList.remove('active'));
            modal.querySelector(`#${targetTab}-tab`).classList.add('active');
        });
    });

    // Form submission
    modal.querySelector('.new-ticket-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const subject = modal.querySelector('#ticket-subject').value;
        const description = modal.querySelector('#ticket-description').value;
        
        if (!subject || !description.trim()) {
            displayMessage('Please fill in all required fields.');
            return;
        }

        const submitBtn = modal.querySelector('.submit-ticket-btn');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Submitting...';
        submitBtn.disabled = true;

        try {
            await submitTicket(subject, description);
            
            // Reset form
            modal.querySelector('.new-ticket-form').reset();
            
            // Refresh ticket history
            await fetchUserTickets();
            const historyContainer = modal.querySelector('.ticket-history-container');
            historyContainer.innerHTML = renderTicketHistory();
            
            // Switch to history tab
            modal.querySelector('[data-tab="ticket-history"]').click();
            
            displayMessage('Ticket submitted successfully! Our support team will review it soon.');
            
        } catch (error) {
            console.error('Error submitting ticket:', error);
            displayMessage('Failed to submit ticket. Please try again.');
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
}

async function fetchUserTickets() {
    console.log('--- Starting fetchUserTickets function ---');
    console.log('Profile data:', _profile);
    console.log('Using chat_id:', _profile.chat_id);
    
    try {
        // Use the same API pattern as god selection - remove baseUrl construction
        const url = `/api/supabase/rest/v1/tickets?chat_id=eq.${_profile.chat_id}&select=*&order=created_at.desc`;
        console.log('Making API call to:', url);
        
        const response = await _apiCall(url);
        console.log('API call successful. Response status:', response.status);
        
        _userTickets = await response.json();
        console.log('Tickets loaded:', _userTickets);
        
        if (_userTickets.length === 0) {
            console.warn('No tickets found for this user.');
        }
    } catch (error) {
        console.error('Error fetching tickets:', error);
        _userTickets = [];
    }
    console.log('--- fetchUserTickets function finished ---');
}

async function submitTicket(subject, description) {
    console.log(`--- Starting submitTicket function ---`);
    console.log('Subject:', subject);
    console.log('Description length:', description.length);
    console.log('Profile data:', _profile);
    
    const ticketData = {
        chat_id: _profile.chat_id,
        ticket_text: `Subject: ${subject}\n\nDescription: ${description}`,
        status: 'open'
    };
    console.log('Ticket data to submit:', ticketData);

    try {
        // First, create the ticket in the database
        const url = `/api/supabase/rest/v1/tickets`;
        console.log('Making API call to create ticket:', url);
        
        const response = await _apiCall(url, {
            method: 'POST',
            body: ticketData
        });
        console.log('Ticket creation API call successful. Response status:', response.status);

        if (!response.ok) {
            throw new Error('Failed to create ticket');
        }

        const createdTicket = await response.json();
        console.log('Ticket created successfully:', createdTicket);
        
        // Get the ticket ID from the created ticket
        const ticketId = createdTicket[0]?.id || createdTicket.id;
        
        if (ticketId) {
            console.log('Attempting to send support notification for ticket ID:', ticketId);
            
            // Send notification to support via edge function
            try {
                const notificationResponse = await _apiCall('/functions/v1/notify-support', {
                    method: 'POST',
                    body: {
                        ticketId: ticketId,
                        userId: _profile.chat_id,
                        subject: subject,
                        description: description
                    }
                });
                
                console.log('Support notification response status:', notificationResponse.status);
                
                if (notificationResponse.ok) {
                    console.log('Support notification sent successfully');
                } else {
                    console.warn('Support notification failed, but ticket was created successfully');
                }
            } catch (notificationError) {
                console.error('Error sending support notification:', notificationError);
                // Don't fail the entire operation if notification fails
                console.log('Ticket was created successfully despite notification error');
            }
        } else {
            console.warn('No ticket ID found in response, skipping notification');
        }
        
        return createdTicket;
    } catch (error) {
        console.error('Error creating ticket:', error);
        throw error;
    } finally {
        console.log('--- submitTicket function finished ---');
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function displayMessage(message) {
    const messageBox = document.createElement('div');
    messageBox.className = 'custom-message-box';
    messageBox.innerHTML = `
        <div class="message-content">
            <p>${message}</p>
            <button class="fantasy-button message-ok-btn">OK</button>
        </div>
    `;
    document.body.appendChild(messageBox);

    messageBox.querySelector('.message-ok-btn').addEventListener('click', () => {
        messageBox.remove();
    });
}

function addSupportStyles() {
    const styleId = 'support-styles';
    if (document.getElementById(styleId)) {
        return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .support-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            animation: fadeIn 0.3s ease-out;
        }

        .support-modal-content {
            background: linear-gradient(145deg, #1d140c, #2a1f16);
            border: 2px solid #c4975a;
            border-radius: 15px;
            padding: 0;
            margin: 1rem;
            max-width: 700px;
            min-height: 95vh;
            width: 95%;
            color: #e0d8c9;
            font-family: 'Cinzel', serif;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
            position: relative;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        .support-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.5rem 2rem;
            border-bottom: 1px solid #c4975a;
            background: rgba(42, 31, 22, 0.3);
        }

        .support-header h2 {
            margin: 0;
            color: #c4975a;
            font-size: 1.8rem;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
        }

        .support-close-btn {
            background: none;
            border: none;
            color: #c4975a;
            font-size: 2rem;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background-color 0.3s ease, transform 0.2s ease;
        }

        .support-close-btn:hover {
            background-color: rgba(196, 151, 90, 0.2);
            transform: rotate(90deg);
        }

        .support-tabs {
            display: flex;
            background: rgba(42, 31, 22, 0.2);
            border-bottom: 1px solid #c4975a;
        }

        .support-tab-btn {
            flex: 1;
            padding: 1rem;
            background: transparent;
            border: none;
            color: #c4975a;
            font-family: 'Cinzel', serif;
            font-size: 1rem;
            cursor: pointer;
            transition: background-color 0.3s ease;
            border-right: 1px solid rgba(196, 151, 90, 0.3);
        }

        .support-tab-btn:last-child {
            border-right: none;
        }

        .support-tab-btn:hover {
            background: rgba(196, 151, 90, 0.1);
        }

        .support-tab-btn.active {
            background: rgba(196, 151, 90, 0.2);
            color: #e0d8c9;
        }

        .support-body {
            flex: 1;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        .support-tab-content {
            flex: 1;
            padding: 2rem;
            overflow-y: auto;
            display: none;
        }

        .support-tab-content.active {
            display: block;
        }

        .new-ticket-form {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .form-group {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .form-group label {
            color: #c4975a;
            font-weight: bold;
            font-size: 1rem;
        }

        .form-group select,
        .form-group textarea {
            background: rgba(42, 31, 22, 0.5);
            border: 1px solid #c4975a;
            border-radius: 8px;
            padding: 0.8rem;
            color: #e0d8c9;
            font-family: 'Cinzel', serif;
            font-size: 1rem;
            resize: vertical;
        }

        .form-group select:focus,
        .form-group textarea:focus {
            outline: none;
            border-color: #d4a76a;
            background: rgba(42, 31, 22, 0.7);
        }

        .form-group textarea {
            min-height: 120px;
        }

        .form-actions {
            display: flex;
            justify-content: flex-end;
            margin-top: 1rem;
        }

        .submit-ticket-btn {
            padding: 1rem 2rem;
            font-size: 1rem;
        }

        .submit-ticket-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .ticket-history-container {
            max-height: 100%;
            overflow-y: auto;
        }

        .no-tickets {
            text-align: center;
            padding: 2rem;
            color: #c4975a;
        }

        .no-tickets p {
            margin: 0.5rem 0;
            font-size: 1.1rem;
        }

        .tickets-list {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .ticket-item {
            background: rgba(42, 31, 22, 0.5);
            border-radius: 8px;
            border: 1px solid #c4975a;
            padding: 1.5rem;
            transition: background-color 0.3s ease, transform 0.2s ease;
        }

        .ticket-item:hover {
            background: rgba(42, 31, 22, 0.7);
            transform: translateX(2px);
        }

        .ticket-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }

        .ticket-id {
            font-weight: bold;
            color: #c4975a;
            font-size: 1.1rem;
        }

        .ticket-status {
            padding: 0.3rem 0.8rem;
            border-radius: 15px;
            font-size: 0.8rem;
            font-weight: bold;
            text-transform: uppercase;
        }

        .status-open {
            background: rgba(255, 193, 7, 0.2);
            color: #ffc107;
            border: 1px solid #ffc107;
        }

        .status-closed {
            background: rgba(40, 167, 69, 0.2);
            color: #28a745;
            border: 1px solid #28a745;
        }

        .status-in-progress {
            background: rgba(23, 162, 184, 0.2);
            color: #17a2b8;
            border: 1px solid #17a2b8;
        }

        .ticket-content {
            display: flex;
            flex-direction: column;
            gap: 0.8rem;
        }

        .ticket-date {
            color: #c4975a;
            font-size: 0.9rem;
            opacity: 0.8;
        }

        .ticket-text {
            line-height: 1.5;
            white-space: pre-wrap;
        }

        .support-body::-webkit-scrollbar,
        .ticket-history-container::-webkit-scrollbar {
            width: 8px;
        }

        .support-body::-webkit-scrollbar-track,
        .ticket-history-container::-webkit-scrollbar-track {
            background: rgba(29, 20, 12, 0.3);
            border-radius: 4px;
        }

        .support-body::-webkit-scrollbar-thumb,
        .ticket-history-container::-webkit-scrollbar-thumb {
            background: #c4975a;
            border-radius: 4px;
        }

        .support-body::-webkit-scrollbar-thumb:hover,
        .ticket-history-container::-webkit-scrollbar-thumb:hover {
            background: #d4a76a;
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: scale(0.9);
            }
            to {
                opacity: 1;
                transform: scale(1);
            }
        }

        /* Custom message box styles */
        .custom-message-box {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1001;
        }

        .custom-message-box .message-content {
            background: linear-gradient(145deg, #1d140c, #2a1f16);
            border: 2px solid #c4975a;
            border-radius: 10px;
            padding: 2rem;
            text-align: center;
            color: #e0d8c9;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
            max-width: 80%;
            font-family: 'Cinzel', serif;
        }

        .custom-message-box .message-content p {
            margin-bottom: 1.5rem;
            font-size: 1.1rem;
        }

        .custom-message-box .message-ok-btn {
            padding: 0.8rem 1.5rem;
            font-size: 1rem;
            cursor: pointer;
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
            .support-header {
                padding: 1rem;
            }

            .support-header h2 {
                font-size: 1.5rem;
            }

            .support-tab-content {
                padding: 1rem;
            }

            .ticket-item {
                padding: 1rem;
            }

            .ticket-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 0.5rem;
            }
        }
    `;
    document.head.appendChild(style);
}
