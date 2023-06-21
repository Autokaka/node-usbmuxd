// Created by Autokaka (qq1909698494@gmail.com) on 2023/06/20.

import { Socket, createConnection } from "net";
import { UsbmuxdErrno } from "./usbmuxd_errno";
import { USBMUXD_SOCKET_FILE, usbmuxd_result } from "usbmuxd_proto";
import { isNumber, isRecord, isString } from "private/type_guard";
import { PlistObject } from "plist";
import { usbmuxd_header } from "usbmuxd_proto";
import { usbmuxd_msgtype } from "usbmuxd_proto";
import plist = require("plist");

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
export type usbmuxd_subscription_context_t = Record<PropertyKey, never>;

export type usbmuxd_socket_fd_t = Record<PropertyKey, never>;

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
export async function usbmuxd_get_device_list(): Promise<usbmuxd_device_info_t[] | number> {
  return new Promise((resolve) => {
    const __func__ = "usbmuxd_get_device_list";

    let sfd: Socket | number;
    let tag = 0;

    const connect_and_list_devices = async (): Promise<void> => {
      sfd = await connect_usbmuxd_socket();
      if (isNumber(sfd)) {
        console.assert(sfd < 0);
        LIBUSBMUXD_DEBUG(1, `${__func__}: error opening socket!`);
        resolve(sfd);
        return;
      }

      // proto_version conformed, just list devices
      tag = ++_use_tag;
      if (_proto_version == 1) {
        const lsdev_result = await socket_list_devices(sfd, tag);
        if (isNumber(lsdev_result)) {
          if (lsdev_result == usbmuxd_result.RESULT_BADVERSION) {
            _proto_version = 0;
          }
          sfd.destroy();
          await connect_and_list_devices();
          return;
        }

        const plist_devlist = lsdev_result.DeviceList;
        const device_list: usbmuxd_device_info_t[] = [];
        if (plist_devlist instanceof Array /** PlistArray */) {
          for (const plistdev of plist_devlist) {
            console.assert(isRecord(plistdev));
            const plist_devrecord = plistdev as PlistObject;
            const device_info = device_info_from_plist(plist_devrecord);
            if (!device_info) {
              sfd.destroy();
              LIBUSBMUXD_DEBUG(1, `${__func__}: Could not create device info object from properties!`);
              resolve(-UsbmuxdErrno.EPERM);
              return;
            }
            device_list.push(device_info);
          }
        }

        // preserve & resolve device_list
        sfd.destroy();
        _devices.splice(0);
        _devices.push(...device_list);
        resolve(device_list);
        return;
      }

      // proto_version unknown, connect & recursively list devices
      tag = ++_use_tag;
      const listen_result = await socket_listen(sfd, tag);
      if (isNumber(listen_result)) {
        sfd.destroy();
        if (listen_result == usbmuxd_result.RESULT_BADVERSION && _proto_version == 1) {
          _proto_version = 0;
          await connect_and_list_devices();
          return;
        }
        LIBUSBMUXD_DEBUG(1, `${__func__}: Could not listen to socket events!`);
        resolve(listen_result);
        return;
      }

      const device_list: usbmuxd_device_info_t[] = [];
      const recursively_get_device_list = async (sfd: Socket): Promise<void> => {
        const data = await socket_receive_data(sfd, 100);
        if (isNumber(data)) {
          // we _should_ have all of them now.
          // or perhaps an error occurred.
          // preserve & resolve device_list.
          sfd.destroy();
          _devices.splice(0);
          _devices.push(...device_list);
          resolve(device_list);
          return;
        }

        const [header, body] = data;
        if (header.message == usbmuxd_msgtype.MESSAGE_DEVICE_ADD) {
          const device_info = device_info_from_data(body);
          if (device_info) {
            _devices.push(device_info);
          } else {
            LIBUSBMUXD_DEBUG(1, `${__func__}: Could not create device info object from raw data!`);
          }
        } else if (header.message == usbmuxd_msgtype.MESSAGE_DEVICE_REMOVE) {
          const handle = new DataView(body).getUint32(0);
          for (let i = 0; i < device_list.length; ++i) {
            const device = device_list[i];
            if (device.handle == handle) {
              device_list.splice(i, 1);
              break;
            }
          }
        } else {
          LIBUSBMUXD_DEBUG(1, `${__func__}: Unexpected message ${header.message}`);
        }
      };
      await recursively_get_device_list(sfd);
    };
    connect_and_list_devices();
  });
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

/////////////////////////////////////////////////////////////////////////////////
// Private //////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////

const PACKAGE = "libusbmuxd";
const PLIST_LIBUSBMUX_VERSION = 3;

type usbmuxd_subscription_context = {
  callback: usbmuxd_event_cb_t;
  user_data: ArrayBuffer;
};

let _log_level_limit = 0;
let _watching = false;
let _use_tag = 0;
let _proto_version = 1;

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

const _sfd_map = new Map<usbmuxd_socket_fd_t, Socket>();
function connect_usbmuxd_socket(): Promise<Socket | number> {
  return new Promise((resolve) => {
    const socket = createConnection(USBMUXD_SOCKET_FILE);
    socket.addListener("connect", () => {
      socket.removeAllListeners();
      resolve(socket);
    });
    socket.addListener("error", () => {
      resolve(-UsbmuxdErrno.ENOENT);
    });
  });
}

function socket_list_devices(sfd: Socket, tag: number): Promise<PlistObject | number> {
  return socket_send_plist(sfd, tag, create_plist_message("ListDevices")) as Promise<PlistObject | number>;
}

async function socket_listen(sfd: Socket, tag: number): Promise<void | number> {
  if (_proto_version == 1) {
    /* construct message plist */
    return socket_send_plist(sfd, tag, create_plist_message("Listen")) as Promise<void | number>;
  } else {
    /* binary packet */
    return socket_send_data(sfd, usbmuxd_msgtype.MESSAGE_LISTEN, tag) as Promise<void | number>;
  }
}

async function socket_send_plist(sfd: Socket, tag: number, plist_object: PlistObject): Promise<void | PlistObject | number> {
  const data = new TextEncoder().encode(plist.build(plist_object));
  const result = await socket_send_data(sfd, usbmuxd_msgtype.MESSAGE_PLIST, tag, data.buffer);
  if (result instanceof ArrayBuffer) {
    return plist.parse(new TextDecoder().decode(result)) as PlistObject;
  }
  return result;
}

function socket_send_data(sfd: Socket, message: usbmuxd_msgtype, tag: number, data?: ArrayBuffer): Promise<void | ArrayBuffer | number> {
  const __func__ = "socket_send_data";
  const socket_send_raw_data = (data: Uint8Array): Promise<boolean> => {
    return new Promise((resolve) => {
      const success = sfd.write(data, (error) => {
        if (success) {
          resolve(error === undefined);
        }
      });
      if (!success) {
        resolve(false);
      }
    });
  };
  return new Promise(async (resolve) => {
    const header_byte_length = 4 /** uint32_t */ * 4;
    const data_byte_length = data?.byteLength ?? 0;
    const header: usbmuxd_header = {
      length: header_byte_length + data_byte_length,
      version: _proto_version,
      message,
      tag,
    };
    const header_data = new Uint8Array(header_byte_length);
    const header_view = new DataView(header_data.buffer);
    header_view.setUint32(0, header.length);
    header_view.setUint32(4, header.version);
    header_view.setUint32(8, header.message);
    header_view.setUint32(12, header.tag);
    const header_sent = await socket_send_raw_data(header_data);
    if (!header_sent) {
      LIBUSBMUXD_DEBUG(1, `${__func__}: ERROR: could not send packet header!`);
      resolve(-UsbmuxdErrno.EPERM);
      return;
    }

    if (data && data.byteLength > 0) {
      const data_sent = await socket_send_raw_data(new Uint8Array(data));
      if (!data_sent) {
        LIBUSBMUXD_DEBUG(1, `${__func__}: ERROR: could not send whole packet!`);
        sfd.destroy();
        resolve(-UsbmuxdErrno.EPERM);
        return;
      }
    }

    const on_data_received = (recv_data: Uint8Array) => {
      sfd.removeListener("data", on_data_received);
      resolve(/** TODO(Autokaka): resolve() or resolve(ArrayBuffer) */);
    };
    sfd.addListener("data", on_data_received);
  });
}

async function socket_receive_data(sfd: Socket, timeout = 0): Promise<[usbmuxd_header, ArrayBuffer] | number> {
  throw new Error();
}

function create_plist_message(message_type: string): PlistObject {
  return plist.parse(`<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
    <key>ClientVersionString</key>
    <string>${PACKAGE}</string>
    <key>MessageType</key>
    <string>${message_type}</string>
    <key>kLibUSBMuxVersion</key>
    <string>${PLIST_LIBUSBMUX_VERSION}</string>
  </plist>`) as PlistObject;
}

function device_info_from_plist(props: PlistObject): usbmuxd_device_info_t | undefined {
  const __func__ = "device_info_from_plist";
  const { DeviceID, ProductID, SerialNumber, ConnectionType, NetworkAddress } = props;
  let success = true;
  if (!isNumber(DeviceID)) {
    LIBUSBMUXD_ERROR(`${__func__}: Failed to get DeviceID!`);
    success = false;
  }
  if (!isNumber(ProductID)) {
    LIBUSBMUXD_ERROR(`${__func__}: Failed to get ProductID!`);
    success = false;
  }
  if (!isString(SerialNumber)) {
    LIBUSBMUXD_ERROR(`${__func__}: Failed to get SerialNumber!`);
    success = false;
  }
  if (ConnectionType !== "USB" && ConnectionType !== "Network") {
    LIBUSBMUXD_ERROR(`${__func__}: Unexpected ConnectionType!`);
    success = false;
  }
  if (ConnectionType === "Network" && !(NetworkAddress instanceof Uint8Array)) {
    LIBUSBMUXD_ERROR(`${__func__}: Failed to get NetworkAddress!`);
    success = false;
  }
  if (!success) {
    return undefined;
  }
  const device_info: usbmuxd_device_info_t = {
    handle: DeviceID as number,
    product_id: ProductID as number,
    udid: SerialNumber as string,
    conn_type: ConnectionType == "Network" ? usbmux_connection_type.CONNECTION_TYPE_NETWORK : usbmux_connection_type.CONNECTION_TYPE_USB,
    conn_data: ConnectionType == "Network" ? (NetworkAddress as Uint8Array) : new Uint8Array(),
  };
  return device_info;
}

function device_info_from_data(data: ArrayBuffer): usbmuxd_device_info_t | undefined {
  throw new Error();
}
