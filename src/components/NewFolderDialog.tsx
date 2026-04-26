import type { ChangeEvent, SetStateAction } from "react";
import React, {
  createRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { createFolder } from "../actions/create-folder";
import { useKeyPress } from "../helpers/use-key-press";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export const createNewFolderRef = createRef<{
  openDialog: () => void;
}>();

export const NewFolderDialog: React.FC<{
  setSelectedFolder: React.Dispatch<SetStateAction<string | null>>;
  refreshFoldersList: () => Promise<void>;
}> = ({ refreshFoldersList, setSelectedFolder }) => {
  const [newProject, setNewProject] = useState<string>("");
  const [open, setOpen] = useState<boolean>(false);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setNewProject(event.target.value);
  };

  const getRegex = () => /^([a-zA-Z0-9-\u4E00-\u9FFF])+$/g;

  const invalidInput = useMemo(() => {
    const match = newProject.match(getRegex());
    if (newProject.length === 0) {
      return null;
    }

    if (!match || match.length === 0) {
      return "Имя проекта не может содержать пробелы или спецсимволы.";
    }

    return null;
  }, [newProject]);

  const disabled = useMemo(() => {
    return invalidInput !== null || newProject.length === 0;
  }, [invalidInput, newProject.length]);

  const handleSubmit = useCallback(async () => {
    try {
      const res = await createFolder(newProject);
      if (!res.success) {
        throw new Error(res.message);
      }

      setSelectedFolder(newProject);
      setNewProject("");
      refreshFoldersList();
      setOpen(false);
    } catch (e) {
      alert((e as Error).stack);
    }
  }, [newProject, refreshFoldersList, setSelectedFolder]);

  useImperativeHandle(createNewFolderRef, () => {
    return {
      openDialog: () => {
        setOpen(true);
      },
    };
  }, []);

  const handlePressEnter = useCallback(() => {
    if (!disabled) {
      handleSubmit();
    }
  }, [disabled, handleSubmit]);

  useKeyPress({ keys: ["Enter"], callback: handlePressEnter, metaKey: false });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Новая папка</DialogTitle>
          <DialogDescription>
            Создай новую подпапку внутри <code>public/</code>. Имя должно совпадать
            с ID композиции в Remotion Studio.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Имя папки
            </Label>

            <Input
              id="remotion_video_name"
              placeholder="моё-видео"
              value={newProject}
              className="col-span-3"
              onChange={handleChange}
            />
            <Label className="col-start-2 col-end-5 text-red-600">
              {invalidInput ?? null}
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={disabled} onClick={handleSubmit}>
            Создать подпапку
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
