// Created by Autokaka (qq1909698494@gmail.com) on 2023/06/20.

import { UsbmuxdErrno } from "./usbmuxd_errno";

const PACKAGE = "libusbmuxd";

let _log_level_limit = 0;
const _listener_map = new Map<usbmuxd_subscription_context_t, usbmuxd_subscription_context>();
const _devices: usbmuxd_device_info_t[] = [];

function LIBUSBMUXD_DEBUG(level: number, ...args: unknown[]): void {
  if (level <= _log_level_limit) {
    console.error(`[${PACKAGE}]`, ...args);
  }
}
function LIBUSBMUXD_ERROR(...args: unknown[]): void {
  LIBUSBMUXD_DEBUG(0, ...args);
}

let _watching = false;

/** Device lookup options for usbmuxd_get_device. */
export enum usbmux_lookup_options {
  DEVICE_LOOKUP_USBMUX = 1 << 1 /**< include USBMUX devices during lookup */,
  DEVICE_LOOKUP_NETWORK = 1 << 2 /**< include network devices during lookup */,
  DEVICE_LOOKUP_PREFER_NETWORK = 1 << 3 /**< prefer network connection if device is available via USBMUX *and* network */,
}

/** Type of connection a device is available on */
export enum usbmux_connection_type {
  CONNECTION_TYPE_USB = 1,
  CONNECTION_TYPE_NETWORK,
}

/**
 * Device information structure holding data to identify the device.
 * The relevant 'handle' should be passed to 'usbmuxd_connect()', to
 * start a proxy connection.  The value 'handle' should be considered
 * opaque and no presumption made about the meaning of its value.
 */
export interface usbmuxd_device_info_t {
  handle: number;
  product_id: number;
  udid: string;
  conn_type: usbmux_connection_type;
  conn_data: Uint8Array;
}

/**
 * event types for event callback function
 */
export enum usbmuxd_event_type {
  UE_DEVICE_ADD = 1,
  UE_DEVICE_REMOVE,
  UE_DEVICE_PAIRED,
}

/**
 * Event structure that will be passed to the callback function.
 * 'event' will contains the type of the event, and 'device' will contains
 * information about the device.
 */
export interface usbmuxd_event_t {
  event: number;
  device: usbmuxd_device_info_t;
}

/**
 * Callback function prototype.
 */
export type usbmuxd_event_cb_t = (event: usbmuxd_event_t, user_data: ArrayBuffer) => void;

/**
 * Subscription context type.
 */
export type usbmuxd_subscription_context_t = Record<PropertyKey, never>; /** usbmuxd_subscription_context */
type usbmuxd_subscription_context = {
  callback: usbmuxd_event_cb_t;
  user_data: ArrayBuffer;
};

/**
 * Subscribe a callback function to be called upon device add/remove events.
 * This method can be called multiple times to register multiple callbacks
 * since every subscription will have its own context (returned in the
 * first parameter).
 *
 * @param callback A callback function that is executed when an event occurs.
 * @param user_data Custom data passed on to the callback function. The data
 *    needs to be kept available until the callback function is unsubscribed.
 *
 * @return usbmuxd_subscription_context_t on success or a negative errno value.
 */
export function usbmuxd_events_subscribe(callback: usbmuxd_event_cb_t, user_data: ArrayBuffer): usbmuxd_subscription_context_t | number {
  const context: usbmuxd_subscription_context = { callback, user_data };
  const context_handle = {};
  _listener_map.set(context_handle, context);

  if (!_watching) {
    return context_handle;
  }

  /* we need to submit DEVICE_ADD events to the new listener */
  for (const device of _devices) {
    const event = usbmuxd_event_type.UE_DEVICE_ADD;
    const usbmuxd_event: usbmuxd_event_t = { event, device };
    context.callback(usbmuxd_event, context.user_data);
  }
  return context_handle;
}

/**
 * Unsubscribe callback function
 *
 * @param context A valid context as returned from usbmuxd_events_subscribe().
 *
 * @return 0 on success or a negative errno value.
 */
export function usbmuxd_events_unsubscribe(context: usbmuxd_subscription_context_t): number {
  const registered_context = _listener_map.get(context);
  if (!registered_context) {
    return -UsbmuxdErrno.EINVAL;
  }

  for (const device of _devices) {
    const event = usbmuxd_event_type.UE_DEVICE_REMOVE;
    const usbmuxd_event: usbmuxd_event_t = { event, device };
    registered_context.callback(usbmuxd_event, context.user_data);
  }
  _listener_map.delete(context);
  return 0;
}

/**
 * Contacts usbmuxd and retrieves a list of connected devices.
 *
 * @return array of attached devices, zero on no devices, or negative number
 *      if an error occured.
 */
export function usbmuxd_get_device_list(): usbmuxd_device_info_t[] | number {
  // Try to make socket connection.
  // Tray to get connected devices.
  throw new Error();
}

/**
 * Frees the device list returned by an usbmuxd_get_device_list call
 *
 * @param device_list A pointer to an array of usbmuxd_device_info_t to free.
 *
 * @return 0 on success, -1 on error.
 */
export function usbmuxd_device_list_free(device_list: usbmuxd_device_info_t[]): number {
  throw new Error();
}

/**
 * Looks up the device specified by UDID and returns device information.
 *
 * @note This function only considers devices connected through USB. To
 *      query devices available via network, use usbmuxd_get_device().
 *
 * @see usbmuxd_get_device
 *
 * @param udid A device UDID of the device to look for. If udid is NULL,
 *      This function will return the first device found.
 *
 * @return 0 if no matching device is connected,
 *    usbmuxd_device_info_t if the device was found,
 *    or a negative value on error.
 */
export function usbmuxd_get_device_by_udid(udid: string): usbmuxd_device_info_t | number {
  throw new Error();
}

/**
 * Looks up the device specified by UDID with given options and returns
 * device information.
 *
 * @param udid A device UDID of the device to look for. If udid is NULL,
 *      this function will return the first device found.
 * @param device Pointer to a previously allocated (or static)
 *      usbmuxd_device_info_t that will be filled with the device info.
 * @param options Specifying what device connection types should be
 *      considered during lookup. Accepts bitwise or'ed values of
 *      usbmux_lookup_options.
 *      If 0 (no option) is specified it will default to DEVICE_LOOKUP_USBMUX.
 *      To lookup both USB and network-connected devices, pass
 *      DEVICE_LOOKUP_USBMUX | DEVICE_LOOKUP_NETWORK. If a device is available
 *      both via USBMUX *and* network, it will select the USB connection.
 *      This behavior can be changed by adding DEVICE_LOOKUP_PREFER_NETWORK
 *      to the options in which case it will select the network connection.
 *
 * @see enum usbmux_lookup_options
 *
 * @return 0 if no matching device is connected,
 *    usbmuxd_device_info_t if the device was found,
 *    or a negative value on error.
 */
export function usbmuxd_get_device(udid: string, options: usbmux_lookup_options): usbmuxd_device_info_t | number {
  throw new Error();
}

/**
 * Request proxy connection to the specified device and port.
 *
 * @param handle returned in the usbmux_device_info_t structure via
 *      usbmuxd_get_device() or usbmuxd_get_device_list().
 *
 * @param tcp_port TCP port number on device, in range 0-65535.
 *	common values are 62078 for lockdown, and 22 for SSH.
 *
 * @return socket file descriptor of the connection, or a negative errno
 *    value on error.
 */
export function usbmuxd_connect(handle: number, tcp_port: number): number {
  throw new Error();
}

/**
 * Disconnect. For now, this just closes the socket file descriptor.
 *
 * @param sfd socket file descriptor returned by usbmuxd_connect()
 *
 * @return 0 on success, -1 on error.
 */
export function usbmuxd_disconnect(sfd: number): number {
  throw new Error();
}

/**
 * Send data to the specified socket.
 *
 * @param sfd socket file descriptor returned by usbmuxd_connect()
 * @param data buffer to send
 *
 * @return 0 on success, a negative errno value otherwise.
 */
export function usbmuxd_send(sfd: number, data: ArrayBuffer): number {
  throw new Error();
}

/**
 * Receive data from the specified socket.
 *
 * @param sfd socket file descriptor returned by usbmuxd_connect()
 * @param timeout how many milliseconds to wait for data
 *
 * @return ArrayBuffer on success, a negative errno value otherwise.
 */
export function usbmuxd_recv_timeout(sfd: number, timeout: number): ArrayBuffer | number {
  throw new Error();
}

/**
 * Receive data from the specified socket with a default timeout.
 *
 * @param sfd socket file descriptor returned by usbmuxd_connect()
 *
 * @return ArrayBuffer on success, a negative errno value otherwise.
 */
export function usbmuxd_recv(sfd: number): ArrayBuffer | number {
  throw new Error();
}

/**
 * Reads the SystemBUID
 *
 * @return string on success, a negative errno value otherwise.
 */
export function usbmuxd_read_buid(): string | number {
  throw new Error();
}

/**
 * Read a pairing record
 *
 * @param record_id the record identifier of the pairing record to retrieve
 *
 * @return ArrayBuffer on success, a negative error value otherwise.
 */
export function usbmuxd_read_pair_record(record_id: string): ArrayBuffer | number {
  throw new Error();
}

/**
 * Save a pairing record
 *
 * @param record_id the record identifier of the pairing record to save
 * @param record_data buffer containing the pairing record data
 *
 * @return 0 on success, a negative error value otherwise.
 */
export function usbmuxd_save_pair_record(record_id: string, record_data: ArrayBuffer): number {
  throw new Error();
}

/**
 * Save a pairing record with device identifier
 *
 * @param record_id the record identifier of the pairing record to save
 * @param device_id the device identifier of the connected device, or 0
 * @param record_data buffer containing the pairing record data
 *
 * @return 0 on success, a negative error value otherwise.
 */
export function usbmuxd_save_pair_record_with_device_id(record_id: string, device_id: number, record_data: ArrayBuffer): number {
  throw new Error();
}

/**
 * Delete a pairing record
 *
 * @param record_id the record identifier of the pairing record to delete.
 *
 * @return 0 on success, a negative errno value otherwise.
 */
export function usbmuxd_delete_pair_record(record_id: string): number {
  throw new Error();
}

export function libusbmuxd_set_debug_level(level: number): void {}
