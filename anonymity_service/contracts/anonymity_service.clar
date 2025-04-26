;; Blockchain Anonymity Service

;; Define constants
(define-constant contract-owner tx-sender)
(define-constant min-message-length u10)
(define-constant max-bulk-messages u5)
(define-constant max-message-size u500)
(define-constant encryption-version u1)
(define-constant max-reply-depth u5)

;; Error codes
(define-constant err-owner-only (err u100))
(define-constant err-already-initialized (err u101))
(define-constant err-not-initialized (err u102))
(define-constant err-invalid-message-length (err u103))
(define-constant err-message-not-found (err u104))
(define-constant err-invalid-message-count (err u105))
(define-constant err-message-limit-exceeded (err u106))
(define-constant err-invalid-reply-depth (err u107))
(define-constant err-invalid-category (err u108))
(define-constant err-rate-limit-exceeded (err u109))

;; Define data variables
(define-data-var initialized bool false)
(define-data-var message-counter uint u0)
(define-data-var service-fee uint u100) ;; in microSTX
(define-data-var rate-limit-window uint u86400) ;; 24 hours in seconds
(define-data-var max-messages-per-window uint u10)

;; Define data maps
(define-map messages uint {
    sender: (optional principal),
    content: (string-utf8 500),
    timestamp: uint,
    category: (optional (string-utf8 50)),
    reply-to: (optional uint),
    reply-depth: uint,
    encrypted: bool
})

(define-map user-message-count {user: principal, window: uint} uint)
(define-map categories (string-utf8 50) bool)
(define-map message-replies uint (list 20 uint))


;; Private function to check if the contract is initialized
(define-private (is-initialized)
  (var-get initialized))

;; Private function to check if the caller is the contract owner
(define-private (is-contract-owner)
  (is-eq tx-sender contract-owner))

;; Public function to initialize the contract
(define-public (initialize)
  (begin
    (asserts! (is-contract-owner) err-owner-only)
    (asserts! (not (is-initialized)) err-already-initialized)
    (var-set initialized true)
    (ok true)))

;; Public function to send an anonymous message
(define-public (send-anonymous-message (content (string-utf8 500)))
  (let ((message-id (var-get message-counter)))
    (asserts! (is-initialized) err-not-initialized)
    (map-set messages message-id {sender: none, content: content, timestamp: block-height, category: none, reply-to: none, reply-depth: u0, encrypted: false})
    (var-set message-counter (+ message-id u1))
    (ok message-id)))

;; Public function to retrieve a message by ID
(define-read-only (get-message (message-id uint))
  (map-get? messages message-id))

;; Public function to get the total number of messages
(define-read-only (get-message-count)
  (var-get message-counter))

;; Public function for the contract owner to pause the service
(define-public (pause-service)
  (begin
    (asserts! (is-contract-owner) err-owner-only)
    (var-set initialized false)
    (ok true)))

;; Public function for the contract owner to resume the service
(define-public (resume-service)
  (begin
    (asserts! (is-contract-owner) err-owner-only)
    (var-set initialized true)
    (ok true)))

;; Public function to delete a message
(define-read-only (is-valid-content (content (string-utf8 500)))
  (let ((content-length (len content)))
    (and (>= content-length min-message-length)
         (< content-length u500))))

;; Public function to check if a message exists
(define-read-only (does-message-exist (message-id uint))
  (match (map-get? messages message-id)
    message true
    false))

;; Public function to get messages count in a specific range
(define-read-only (get-messages-count (start uint) (end uint))
  (if (and (<= start end) 
           (< end (var-get message-counter)))
      (ok (- end start))
      (err err-invalid-message-count)))

;; Public function to send bulk messages (simplified version)
(define-public (send-bulk-messages (content-1 (string-utf8 500)) 
                                 (content-2 (string-utf8 500)))
  (begin
    (asserts! (is-initialized) err-not-initialized)
    (asserts! (and (is-valid-content content-1)
                   (is-valid-content content-2)) 
              err-invalid-message-length)
    (let ((id-1 (var-get message-counter)))
      (begin
        (map-set messages id-1 
                 {sender: none, content: content-1, timestamp: block-height, category: none, reply-to: none, reply-depth: u0, encrypted: false})
        (var-set message-counter (+ id-1 u1))
        (let ((id-2 (var-get message-counter)))
          (begin
            (map-set messages id-2 
                     {sender: none, content: content-2, timestamp: block-height, category: none, reply-to: none, reply-depth: u0, encrypted: false})
            (var-set message-counter (+ id-2 u1))
            (ok {first-id: id-1, second-id: id-2})))))))

;; Public function to get the last valid message ID
(define-read-only (get-last-message-id)
  (let ((counter (var-get message-counter)))
    (if (> counter u0)
        (ok (- counter u1))
        (err err-not-initialized))))


(define-private (check-rate-limit (user principal))
  (let ((current-window (/ block-height (var-get rate-limit-window)))
        (current-count (default-to u0 (map-get? user-message-count {user: user, window: current-window}))))
    (< current-count (var-get max-messages-per-window))))

(define-private (increment-user-count (user principal))
  (let ((current-window (/ block-height (var-get rate-limit-window)))
        (current-count (default-to u0 (map-get? user-message-count {user: user, window: current-window}))))
    (map-set user-message-count 
             {user: user, window: current-window}
             (+ current-count u1))))

(define-public (send-anonymous-message-with-category 
    (content (string-utf8 500))
    (category (optional (string-utf8 50)))
    (encrypted bool))
  (begin
    (asserts! (is-initialized) err-not-initialized)
    (asserts! (check-rate-limit tx-sender) err-rate-limit-exceeded)
    (asserts! (is-valid-content content) err-invalid-message-length)
    (let ((message-id (var-get message-counter)))
      (map-set messages message-id 
               {sender: none,
                content: content,
                timestamp: block-height,
                category: category,
                reply-to: none,
                reply-depth: u0,
                encrypted: encrypted})
      (increment-user-count tx-sender)
      (var-set message-counter (+ message-id u1))
      (ok message-id))))

;; Admin functions
(define-public (update-service-fee (new-fee uint))
  (begin
    (asserts! (is-contract-owner) err-owner-only)
    (var-set service-fee new-fee)
    (ok true)))

(define-public (update-rate-limits 
    (new-window uint) 
    (new-max-messages uint))
  (begin
    (asserts! (is-contract-owner) err-owner-only)
    (var-set rate-limit-window new-window)
    (var-set max-messages-per-window new-max-messages)
    (ok true)))

(define-read-only (get-message-replies (message-id uint))
  (map-get? message-replies message-id))

(define-read-only (get-user-message-count (user principal))
  (let ((current-window (/ block-height (var-get rate-limit-window))))
    (default-to u0 
      (map-get? user-message-count 
                {user: user, window: current-window}))))

(define-read-only (get-service-fee)
  (var-get service-fee))

;; Private function to get parent message reply depth
(define-private (get-parent-depth (parent-id uint))
  (match (map-get? messages parent-id)
    parent (get reply-depth parent)
    u0))

(define-read-only (get-message-depth (message-id uint))
  (match (map-get? messages message-id)
    message (get reply-depth message)
    u0))

(define-public (reply-to-message 
    (content (string-utf8 500))
    (parent-id uint)
    (encrypted bool))
  (begin
    (asserts! (is-initialized) err-not-initialized)
    (asserts! (check-rate-limit tx-sender) err-rate-limit-exceeded)
    (asserts! (does-message-exist parent-id) err-message-not-found)
    (let ((parent-depth (get-parent-depth parent-id))
          (new-depth (+ parent-depth u1)))
      (asserts! (< new-depth max-reply-depth) err-invalid-reply-depth)
      (let ((message-id (var-get message-counter)))
        (map-set messages message-id 
                 {sender: none,
                  content: content,
                  timestamp: block-height,
                  category: none,
                  reply-to: (some parent-id),
                  reply-depth: new-depth,  ;; Store the calculated depth
                  encrypted: encrypted})
        (map-set message-replies parent-id 
                 (unwrap-panic (as-max-len? 
                   (append (default-to (list) (map-get? message-replies parent-id)) 
                           message-id) 
                   u20)))
        (increment-user-count tx-sender)
        (var-set message-counter (+ message-id u1))
        (ok message-id)))))