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