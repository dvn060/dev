from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..models import Acl, Device
from ..schemas import DeviceConfigOut, DeviceDetailOut

router = APIRouter(prefix="/api/devices", tags=["devices"])


def get_device(device_id: str, db: Session = Depends(get_db)) -> Device:
    device = db.get(
        Device,
        device_id,
        options=[
            selectinload(Device.interfaces),
            selectinload(Device.vlans),
            selectinload(Device.routes),
            selectinload(Device.acls).selectinload(Acl.entries),
        ],
    )
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.get("/{device_id}", response_model=DeviceDetailOut)
def read_device(device: Device = Depends(get_device)):
    return device


@router.get("/{device_id}/config", response_model=DeviceConfigOut)
def read_device_config(device: Device = Depends(get_device)):
    return DeviceConfigOut(
        device_id=device.id,
        hostname=device.hostname,
        source_filename=device.source_filename,
        lines=device.raw_config.splitlines(),
    )
